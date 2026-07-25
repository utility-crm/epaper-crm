import { Hono } from 'hono';
import { ok, err, ErrorCode, ReaderJwtPayload, SubscriptionInterval } from '@epaper/types';
import { getTenantDb } from './db';
import { encrypt, decrypt } from './crypto';
import { verifyJwt } from './jwt';
import { createRazorpayPlan, createSubscription, cancelSubscription, verifySubscriptionSignature, refundPayment } from './razorpay';
import { hashPassword } from './password';
import { sendEmail, refundEmailHtml } from './email';

export interface Env {
  TENANT_ENCRYPTION_KEY: string;
  ORG_JWT_SECRET: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  // Verified Resend sending domain. Reader refund mail is sent from
  // no-reply-<slug>@<RESEND_DOMAIN> so each publication has a distinct sender.
  RESEND_DOMAIN?: string;
}

const app = new Hono<{ Bindings: Env }>();

const INTERVAL_MONTHS: Record<SubscriptionInterval, number> = { monthly: 1, '6month': 6, '12month': 12 };

// How many recurring cycles a subscription runs before Razorpay stops (max ~10 years).
const TOTAL_COUNT: Record<SubscriptionInterval, number> = { monthly: 120, '6month': 20, '12month': 10 };

// Resolve the reader from an Authorization: Bearer <reader JWT> header.
async function getReader(c: any, slug: string): Promise<ReaderJwtPayload | null> {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const payload = await verifyJwt(auth.substring(7), c.env.ORG_JWT_SECRET);
  if (!payload || payload.aud !== 'reader' || payload.tenantSlug !== slug || typeof payload.sub !== 'string') return null;
  return payload as unknown as ReaderJwtPayload;
}

// Resolve an org staff member from a tenant-portal JWT scoped to this slug.
async function getOrgStaff(c: any, slug: string): Promise<{ sub: string; role: string } | null> {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const payload = await verifyJwt(auth.substring(7), c.env.ORG_JWT_SECRET);
  if (!payload || payload.aud !== 'tenant-portal' || payload.tenantSlug !== slug || typeof payload.sub !== 'string') return null;
  return { sub: payload.sub as string, role: payload.role as string };
}

// Read whether the org refunds on cancellation (drives immediate vs end-of-term access loss).
async function orgRefundsOnCancel(db: D1Database): Promise<boolean> {
  try {
    const row = await db.prepare('SELECT process_refunds FROM razorpay_config WHERE id = 1').first<{ process_refunds: number }>();
    return !!row?.process_refunds;
  } catch {
    return false;
  }
}

// Load + decrypt the tenant's Razorpay credentials.
async function tenantRazorpayKeys(db: D1Database, encKey: string): Promise<{ key_id: string; key_secret: string } | null> {
  const cfg = await db.prepare('SELECT key_id, key_secret_enc FROM razorpay_config WHERE id = 1')
    .first<{ key_id: string; key_secret_enc: string }>();
  if (!cfg) return null;
  return { key_id: cfg.key_id, key_secret: await decrypt(cfg.key_secret_enc, encKey) };
}

// Apply a plan's promotional discount and tax.
function finalPaise(price: number, offerPct: number, taxPct: number): number {
  const discountPct = Math.max(0, Math.min(100, offerPct || 0));
  const discounted = price * (1 - discountPct / 100);
  const tax = Math.max(0, taxPct || 0);
  return Math.round(discounted * (1 + tax / 100));
}

// Defensive: make sure the columns this worker relies on exist on older tenant DBs.
async function ensureBillingColumns(db: D1Database) {
  await db.prepare('ALTER TABLE razorpay_config ADD COLUMN process_refunds INTEGER NOT NULL DEFAULT 0').run().catch(() => {});
  await db.prepare("ALTER TABLE reader_subscriptions ADD COLUMN cancelled_at DATETIME").run().catch(() => {});
  await db.prepare('ALTER TABLE plans ADD COLUMN razorpay_plan_id TEXT').run().catch(() => {});
  // Last successful charge on a subscription — needed to know which payment to refund.
  await db.prepare('ALTER TABLE reader_subscriptions ADD COLUMN last_payment_id TEXT').run().catch(() => {});
  // Refund policy + per-publication email identity (single platform sending domain).
  await db.prepare('ALTER TABLE razorpay_config ADD COLUMN refund_window_days INTEGER NOT NULL DEFAULT 7').run().catch(() => {});
  await db.prepare('ALTER TABLE razorpay_config ADD COLUMN support_email TEXT').run().catch(() => {});
  await db.prepare('ALTER TABLE razorpay_config ADD COLUMN display_name TEXT').run().catch(() => {});
  // Reader-raised refund requests, processed by org staff.
  await db.prepare(`CREATE TABLE IF NOT EXISTS reader_refund_requests (
    id TEXT PRIMARY KEY,
    reader_id TEXT NOT NULL,
    subscription_id TEXT,
    reader_email TEXT,
    payment_id TEXT,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'requested',
    refund_amount_paise INTEGER,
    staff_message TEXT,
    razorpay_refund_id TEXT,
    processed_by TEXT,
    processed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run().catch(() => {});
}

function generateWebhookSecret(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

app.post('/api/billing/tenant/:slug/config', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();

  if (!body.key_id || !body.key_secret) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Missing Razorpay credentials'), 400);
  }

  try {
    const db = getTenantDb(c.env, slug);
    await ensureBillingColumns(db);
    const secretEnc = await encrypt(body.key_secret, c.env.TENANT_ENCRYPTION_KEY);

    // Webhook secret: use the one supplied, else keep the existing, else auto-generate one.
    const existing = await db.prepare('SELECT webhook_secret_enc FROM razorpay_config WHERE id = 1').first<{ webhook_secret_enc: string | null }>();
    let webhookPlain: string | null = body.webhook_secret || null;
    let generated = false;
    if (!webhookPlain && !existing?.webhook_secret_enc) {
      webhookPlain = generateWebhookSecret();
      generated = true;
    }
    const webhookEnc = webhookPlain
      ? await encrypt(webhookPlain, c.env.TENANT_ENCRYPTION_KEY)
      : existing?.webhook_secret_enc ?? null;

    const processRefunds = body.process_refunds ? 1 : 0;
    // Refund policy + email identity (single-domain sending; per-publication From/Reply-To).
    const refundWindowDays = Number.isFinite(body.refund_window_days) ? Math.max(0, Math.floor(body.refund_window_days)) : 7;
    const supportEmail = typeof body.support_email === 'string' && body.support_email.trim() ? body.support_email.trim() : null;
    const displayName = typeof body.display_name === 'string' && body.display_name.trim() ? body.display_name.trim() : null;

    await db.prepare(`
      INSERT INTO razorpay_config (id, key_id, key_secret_enc, webhook_secret_enc, process_refunds, refund_window_days, support_email, display_name, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET
        key_id=excluded.key_id,
        key_secret_enc=excluded.key_secret_enc,
        webhook_secret_enc=excluded.webhook_secret_enc,
        process_refunds=excluded.process_refunds,
        refund_window_days=excluded.refund_window_days,
        support_email=excluded.support_email,
        display_name=excluded.display_name,
        updated_at=CURRENT_TIMESTAMP
    `).bind(body.key_id, secretEnc, webhookEnc, processRefunds, refundWindowDays, supportEmail, displayName).run();

    // Only surface the plaintext webhook secret when we just generated it (so the org can paste it into Razorpay).
    return c.json(ok({ configured: true, webhook_secret: generated ? webhookPlain : undefined }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

app.get('/api/billing/tenant/:slug/config', async (c) => {
  const slug = c.req.param('slug');

  try {
    const db = getTenantDb(c.env, slug);
    await ensureBillingColumns(db);
    const config = await db.prepare('SELECT key_id, webhook_secret_enc, process_refunds, refund_window_days, support_email, display_name, updated_at FROM razorpay_config WHERE id = 1')
      .first<{ key_id: string; webhook_secret_enc: string | null; process_refunds: number; refund_window_days: number | null; support_email: string | null; display_name: string | null; updated_at: string }>();

    if (!config) return c.json(ok(null)); // Not configured yet
    // Never return the secrets themselves — only whether they're set.
    return c.json(ok({
      key_id: config.key_id,
      webhook_configured: !!config.webhook_secret_enc,
      process_refunds: !!config.process_refunds,
      refund_window_days: config.refund_window_days ?? 7,
      support_email: config.support_email,
      display_name: config.display_name,
      updated_at: config.updated_at,
    }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// Rotate the tenant's webhook secret. Returns the new plaintext ONCE so the org can
// paste it into their Razorpay dashboard. (No automatic rotation — that would silently
// break delivery until the dashboard is updated.)
app.post('/api/billing/tenant/:slug/config/webhook-secret/rotate', async (c) => {
  const slug = c.req.param('slug');
  const staff = await getOrgStaff(c, slug);
  if (!staff) return c.json(err(ErrorCode.UNAUTHORIZED, 'Org sign-in required'), 401);
  try {
    const db = getTenantDb(c.env, slug);
    await ensureBillingColumns(db);
    const cfg = await db.prepare('SELECT id FROM razorpay_config WHERE id = 1').first();
    if (!cfg) return c.json(err(ErrorCode.BAD_REQUEST, 'Configure Razorpay keys first'), 400);
    const secret = generateWebhookSecret();
    const enc = await encrypt(secret, c.env.TENANT_ENCRYPTION_KEY);
    await db.prepare('UPDATE razorpay_config SET webhook_secret_enc = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').bind(enc).run();
    return c.json(ok({ webhook_secret: secret }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

app.post('/api/billing/tenant/:slug/webhook', async (c) => {
  const slug = c.req.param('slug');
  const signature = c.req.header('x-razorpay-signature');
  if (!signature) return c.json(err(ErrorCode.UNAUTHORIZED, 'Missing signature'), 401);
  
  try {
    const db = getTenantDb(c.env, slug);
    const config = await db.prepare('SELECT webhook_secret_enc FROM razorpay_config WHERE id = 1').first<{webhook_secret_enc: string}>();
    
    if (!config || !config.webhook_secret_enc) {
      return c.json(err(ErrorCode.BAD_REQUEST, 'Webhook not configured for tenant'), 400);
    }
    
    const secret = await decrypt(config.webhook_secret_enc, c.env.TENANT_ENCRYPTION_KEY);
    
    const payloadStr = await c.req.text();
    
    // Verify signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const signatureBytes = new Uint8Array(signature.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const isValid = await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(payloadStr));
    
    if (!isValid) return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid signature'), 401);
    
    const event = JSON.parse(payloadStr);
    await ensureBillingColumns(db);

    // Match the event to a local reader subscription by Razorpay subscription id.
    const subId = event.payload?.subscription?.entity?.id as string | undefined;
    const row = subId
      ? await db.prepare('SELECT id, plan_type FROM reader_subscriptions WHERE razorpay_sub_id = ?').bind(subId).first<{ id: string; plan_type: string }>()
      : null;

    if (row) {
      switch (event.event) {
        case 'subscription.charged': {
          // Renewal succeeded — extend access by one interval.
          const months = INTERVAL_MONTHS[(row.plan_type as SubscriptionInterval)] ?? 1;
          const end = new Date(); end.setMonth(end.getMonth() + months);
          const paymentId = event.payload?.payment?.entity?.id ?? null;
          await db.prepare("UPDATE reader_subscriptions SET status='active', current_end=?, last_payment_id=COALESCE(?, last_payment_id), updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(end.toISOString(), paymentId, row.id).run();
          break;
        }
        case 'subscription.cancelled':
        case 'subscription.completed':
        case 'subscription.halted':
          await db.prepare("UPDATE reader_subscriptions SET status='cancelled', cancelled_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?")
            .bind(row.id).run();
          break;
      }
    }

    // Record the event against its subscription (idempotent on razorpay_event_id).
    // subscription_id is NOT NULL + FK, so only log events we could match to a local sub.
    if (row) {
      await db.prepare(
        'INSERT OR IGNORE INTO reader_billing_events (id, subscription_id, event_type, razorpay_event_id, amount_paise, payload) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), row.id, event.event, event.id || event.account_id || crypto.randomUUID(), event.payload?.payment?.entity?.amount || 0, payloadStr).run();
    }

    return c.json(ok({ processed: true, matched: !!row }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// Reader-facing: create a recurring Razorpay subscription (e-mandate) for a plan,
// billed to the tenant's own account. Lazily creates the Razorpay plan on first use.
app.post('/api/billing/tenant/:slug/reader/subscribe', async (c) => {
  const slug = c.req.param('slug');
  const reader = await getReader(c, slug);
  if (!reader) return c.json(err(ErrorCode.UNAUTHORIZED, 'Sign in to subscribe'), 401);

  const { plan_id } = await c.req.json<{ plan_id: string }>();
  if (!plan_id) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing plan_id'), 400);

  try {
    const db = getTenantDb(c.env, slug);
    // Pre-0011 tenants may lack email_verified; add it (idempotent) before the check.
    await db.prepare('ALTER TABLE readers ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0').run().catch(() => {});
    const readerRow = await db.prepare('SELECT email_verified FROM readers WHERE id = ?').bind(reader.sub).first<{ email_verified: number }>();
    // Fail closed: reject if the reader row is missing OR the email is unverified.
    if (!readerRow || !readerRow.email_verified) {
      return c.json(err(ErrorCode.FORBIDDEN, 'Please verify your email before subscribing.'), 403);
    }
    await ensureBillingColumns(db);
    const plan = await db.prepare(
      'SELECT id, tier_id, name, interval, price_paise, tax_percentage, offer_pct, razorpay_plan_id FROM plans WHERE id = ? AND active = 1'
    ).bind(plan_id).first<{ id: string; tier_id: string; name: string; interval: SubscriptionInterval; price_paise: number; tax_percentage: number; offer_pct: number; razorpay_plan_id: string | null }>();
    if (!plan) return c.json(err(ErrorCode.NOT_FOUND, 'Plan not found'), 404);

    const keys = await tenantRazorpayKeys(db, c.env.TENANT_ENCRYPTION_KEY);
    if (!keys) return c.json(err(ErrorCode.BAD_REQUEST, 'Publication has not configured payments yet'), 400);

    // Ensure a Razorpay plan exists for this reader plan (create + cache on first subscribe).
    let razorpayPlanId = plan.razorpay_plan_id;
    if (!razorpayPlanId) {
      const amount = finalPaise(plan.price_paise, plan.offer_pct, plan.tax_percentage);
      razorpayPlanId = await createRazorpayPlan(keys.key_id, keys.key_secret, plan.name, plan.interval, amount);
      await db.prepare('UPDATE plans SET razorpay_plan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(razorpayPlanId, plan.id).run();
    }

    const sub = await createSubscription(keys.key_id, keys.key_secret, razorpayPlanId, TOTAL_COUNT[plan.interval] ?? 120, {
      plan_id: plan.id, tier_id: plan.tier_id, reader_id: reader.sub,
    });

    return c.json(ok({
      subscription_id: sub.id, key_id: keys.key_id,
      plan: { id: plan.id, name: plan.name, interval: plan.interval },
    }));
  } catch (e) {
    return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Subscribe failed'), 500);
  }
});

// Reader-facing: verify the subscription checkout callback and activate access.
app.post('/api/billing/tenant/:slug/reader/verify', async (c) => {
  const slug = c.req.param('slug');
  const reader = await getReader(c, slug);
  if (!reader) return c.json(err(ErrorCode.UNAUTHORIZED, 'Sign in to subscribe'), 401);

  const body = await c.req.json<{ plan_id: string; razorpay_subscription_id: string; razorpay_payment_id: string; razorpay_signature: string }>();
  if (!body.plan_id || !body.razorpay_subscription_id || !body.razorpay_payment_id || !body.razorpay_signature) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Missing payment fields'), 400);
  }

  try {
    const db = getTenantDb(c.env, slug);
    await ensureBillingColumns(db);
    const plan = await db.prepare('SELECT id, tier_id, interval FROM plans WHERE id = ?')
      .bind(body.plan_id).first<{ id: string; tier_id: string; interval: SubscriptionInterval }>();
    if (!plan) return c.json(err(ErrorCode.NOT_FOUND, 'Plan not found'), 404);

    const keys = await tenantRazorpayKeys(db, c.env.TENANT_ENCRYPTION_KEY);
    if (!keys) return c.json(err(ErrorCode.BAD_REQUEST, 'Payments not configured'), 400);

    const valid = await verifySubscriptionSignature(body.razorpay_payment_id, body.razorpay_subscription_id, body.razorpay_signature, keys.key_secret);
    if (!valid) return c.json(err(ErrorCode.UNAUTHORIZED, 'Payment verification failed'), 401);

    const months = INTERVAL_MONTHS[plan.interval] ?? 1;
    const now = new Date();
    const end = new Date(now); end.setMonth(end.getMonth() + months);

    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO reader_subscriptions
         (id, reader_id, razorpay_sub_id, plan_type, tier_id, plan_id, status, current_start, current_end, last_payment_id)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
       ON CONFLICT(razorpay_sub_id) DO UPDATE SET
         status='active', current_start=excluded.current_start, current_end=excluded.current_end,
         last_payment_id=excluded.last_payment_id, updated_at=CURRENT_TIMESTAMP`
    ).bind(id, reader.sub, body.razorpay_subscription_id, plan.interval, plan.tier_id, plan.id,
           now.toISOString(), end.toISOString(), body.razorpay_payment_id).run();

    // Upgrade/downgrade: this new mandate replaces any prior active subscription for the
    // reader. Cancel the old mandate(s) at Razorpay immediately so they stop auto-debiting —
    // otherwise the reader is charged for every plan they've ever subscribed to.
    const stale = await db.prepare(
      "SELECT id, razorpay_sub_id FROM reader_subscriptions WHERE reader_id = ? AND status = 'active' AND razorpay_sub_id != ?"
    ).bind(reader.sub, body.razorpay_subscription_id).all<{ id: string; razorpay_sub_id: string | null }>();
    for (const s of stale.results ?? []) await cancelSubscriptionRow(db, s, true, keys);

    return c.json(ok({ subscription_id: id, tier_id: plan.tier_id, current_end: end.toISOString() }));
  } catch (e) {
    return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Verify failed'), 500);
  }
});

app.get('/api/billing/tenant/:slug/subscriptions', async (c) => {
  const slug = c.req.param('slug');
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = 20;
  const offset = (page - 1) * pageSize;
  
  try {
    const db = getTenantDb(c.env, slug);
    const [itemsRes, countRes] = await db.batch([
      db.prepare('SELECT * FROM reader_subscriptions ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(pageSize, offset),
      db.prepare('SELECT count(*) as total FROM reader_subscriptions')
    ]);
    
    const total = (countRes.results[0] as unknown as { total: number })?.total ?? 0;
    
    return c.json(ok({
      items: itemsRes.results,
      total,
      page,
      pageSize
    }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

app.get('/health', (c) => c.json(ok({ status: 'ok', worker: 'billing-tenant' })));

// Cancel access-loss helper: refund-processing orgs revoke immediately; otherwise the
// reader keeps access until current_end (they paid for the term). Also cancels the
// recurring mandate at Razorpay so it stops charging.
async function cancelSubscriptionRow(
  db: D1Database,
  sub: { id: string; razorpay_sub_id: string | null },
  immediate: boolean,
  keys: { key_id: string; key_secret: string } | null,
) {
  if (keys && sub.razorpay_sub_id) {
    // Best-effort: stop the mandate. immediate=true cancels now, else at cycle end.
    await cancelSubscription(keys.key_id, keys.key_secret, sub.razorpay_sub_id, immediate).catch(() => {});
  }
  if (immediate) {
    await db.prepare("UPDATE reader_subscriptions SET status='cancelled', current_end=CURRENT_TIMESTAMP, cancelled_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(sub.id).run();
  } else {
    await db.prepare("UPDATE reader_subscriptions SET status='cancelled', cancelled_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(sub.id).run();
  }
}

// ── Reader self-service ─────────────────────────────────────────────────────

// Reader cancels their own active subscription.
app.post('/api/billing/tenant/:slug/reader/subscription/cancel', async (c) => {
  const slug = c.req.param('slug');
  const reader = await getReader(c, slug);
  if (!reader) return c.json(err(ErrorCode.UNAUTHORIZED, 'Sign in to manage your subscription'), 401);
  try {
    const db = getTenantDb(c.env, slug);
    await ensureBillingColumns(db);
    const immediate = await orgRefundsOnCancel(db);
    const keys = await tenantRazorpayKeys(db, c.env.TENANT_ENCRYPTION_KEY);
    const subs = await db.prepare("SELECT id, razorpay_sub_id FROM reader_subscriptions WHERE reader_id = ? AND status = 'active'")
      .bind(reader.sub).all<{ id: string; razorpay_sub_id: string | null }>();
    if (!subs.results?.length) return c.json(err(ErrorCode.NOT_FOUND, 'No active subscription to cancel'), 404);
    for (const s of subs.results) await cancelSubscriptionRow(db, s, immediate, keys);
    return c.json(ok({ cancelled: subs.results.length, access_until: immediate ? 'now' : 'current_period_end' }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// Reader deletes their own account (and all their subscriptions) for this publication.
app.delete('/api/billing/tenant/:slug/reader/account', async (c) => {
  const slug = c.req.param('slug');
  const reader = await getReader(c, slug);
  if (!reader) return c.json(err(ErrorCode.UNAUTHORIZED, 'Sign in to delete your account'), 401);
  try {
    const db = getTenantDb(c.env, slug);
    await ensureBillingColumns(db);
    // Stop any recurring mandates at Razorpay before deleting local records.
    const keys = await tenantRazorpayKeys(db, c.env.TENANT_ENCRYPTION_KEY);
    if (keys) {
      const active = await db.prepare("SELECT razorpay_sub_id FROM reader_subscriptions WHERE reader_id = ? AND status = 'active' AND razorpay_sub_id IS NOT NULL")
        .bind(reader.sub).all<{ razorpay_sub_id: string }>();
      for (const s of active.results ?? []) {
        await cancelSubscription(keys.key_id, keys.key_secret, s.razorpay_sub_id, true).catch(() => {});
      }
    }
    await db.batch([
      db.prepare("UPDATE reader_subscriptions SET status='cancelled' WHERE reader_id = ? AND status = 'active'").bind(reader.sub),
      db.prepare('DELETE FROM reader_subscriptions WHERE reader_id = ?').bind(reader.sub),
      db.prepare('DELETE FROM readers WHERE id = ?').bind(reader.sub),
    ]);
    return c.json(ok({ deleted: true }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// Publication email identity: single platform sending domain, per-publication From name +
// Reply-To. Falls back to the slug when the org hasn't set a display name.
async function pubEmailIdentity(db: D1Database, slug: string): Promise<{ displayName: string; supportEmail: string | null; refundWindowDays: number }> {
  const cfg = await db.prepare('SELECT display_name, support_email, refund_window_days FROM razorpay_config WHERE id = 1')
    .first<{ display_name: string | null; support_email: string | null; refund_window_days: number | null }>().catch(() => null);
  return {
    displayName: cfg?.display_name || slug,
    supportEmail: cfg?.support_email || null,
    refundWindowDays: cfg?.refund_window_days ?? 7,
  };
}

// Reader raises a refund request against their most recent paid subscription.
// Eligibility (within the refund window) is flagged, but the org admin makes the final call.
app.post('/api/billing/tenant/:slug/reader/refund-request', async (c) => {
  const slug = c.req.param('slug');
  const reader = await getReader(c, slug);
  if (!reader) return c.json(err(ErrorCode.UNAUTHORIZED, 'Sign in to request a refund'), 401);
  const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({ reason: '' }));
  try {
    const db = getTenantDb(c.env, slug);
    await ensureBillingColumns(db);
    // Newest subscription that actually has a payment we could refund.
    const sub = await db.prepare(
      "SELECT id, last_payment_id, current_start FROM reader_subscriptions WHERE reader_id = ? AND last_payment_id IS NOT NULL ORDER BY created_at DESC LIMIT 1"
    ).bind(reader.sub).first<{ id: string; last_payment_id: string; current_start: string | null }>();
    if (!sub) return c.json(err(ErrorCode.NOT_FOUND, 'No refundable payment found'), 404);

    // Block a duplicate open request for the same subscription.
    const open = await db.prepare("SELECT id FROM reader_refund_requests WHERE reader_id = ? AND subscription_id = ? AND status = 'requested'")
      .bind(reader.sub, sub.id).first();
    if (open) return c.json(err(ErrorCode.CONFLICT, 'A refund request is already pending'), 409);

    const { refundWindowDays } = await pubEmailIdentity(db, slug);
    const startMs = sub.current_start ? Date.parse(sub.current_start) : NaN;
    const withinWindow = Number.isFinite(startMs)
      ? (Date.now() - startMs) <= refundWindowDays * 86400_000
      : false;

    const id = crypto.randomUUID();
    await db.prepare(
      "INSERT INTO reader_refund_requests (id, reader_id, subscription_id, reader_email, payment_id, reason, status) VALUES (?, ?, ?, ?, ?, ?, 'requested')"
    ).bind(id, reader.sub, sub.id, reader.email ?? null, sub.last_payment_id, reason ?? null).run();

    return c.json(ok({ id, status: 'requested', within_policy_window: withinWindow }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// Reader lists their own refund requests.
app.get('/api/billing/tenant/:slug/reader/refund-requests', async (c) => {
  const slug = c.req.param('slug');
  const reader = await getReader(c, slug);
  if (!reader) return c.json(err(ErrorCode.UNAUTHORIZED, 'Sign in to view your requests'), 401);
  try {
    const db = getTenantDb(c.env, slug);
    await ensureBillingColumns(db);
    const rows = await db.prepare(
      'SELECT id, subscription_id, reason, status, refund_amount_paise, staff_message, created_at, processed_at FROM reader_refund_requests WHERE reader_id = ? ORDER BY created_at DESC'
    ).bind(reader.sub).all();
    return c.json(ok({ items: rows.results }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// ── Org-admin user management (staff-authed) ────────────────────────────────

// List readers with their current subscription status.
app.get('/api/billing/tenant/:slug/users', async (c) => {
  const slug = c.req.param('slug');
  const staff = await getOrgStaff(c, slug);
  if (!staff) return c.json(err(ErrorCode.UNAUTHORIZED, 'Org sign-in required'), 401);
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = 25;
  const offset = (page - 1) * pageSize;
  try {
    const db = getTenantDb(c.env, slug);
    const [itemsRes, countRes] = await db.batch([
      db.prepare(`
        SELECT r.id, r.email, r.name, r.created_at,
               (SELECT status FROM reader_subscriptions s WHERE s.reader_id = r.id ORDER BY s.created_at DESC LIMIT 1) AS sub_status,
               (SELECT current_end FROM reader_subscriptions s WHERE s.reader_id = r.id AND s.status='active' ORDER BY s.current_end DESC LIMIT 1) AS current_end
        FROM readers r ORDER BY r.created_at DESC LIMIT ? OFFSET ?`).bind(pageSize, offset),
      db.prepare('SELECT count(*) as total FROM readers'),
    ]);
    const total = (countRes.results[0] as unknown as { total: number })?.total ?? 0;
    return c.json(ok({ items: itemsRes.results, total, page, pageSize }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// Org creates a reader account (id is a generated UUID, never autoincrement).
app.post('/api/billing/tenant/:slug/users', async (c) => {
  const slug = c.req.param('slug');
  const staff = await getOrgStaff(c, slug);
  if (!staff) return c.json(err(ErrorCode.UNAUTHORIZED, 'Org sign-in required'), 401);
  const body = await c.req.json<{ email?: string; name?: string; password?: string }>();
  if (!body.email || !body.name) return c.json(err(ErrorCode.BAD_REQUEST, 'Email and name are required'), 400);
  try {
    const db = getTenantDb(c.env, slug);
    const existing = await db.prepare('SELECT id FROM readers WHERE email = ?').bind(body.email).first();
    if (existing) return c.json(err(ErrorCode.CONFLICT, 'A reader with this email already exists'), 409);
    // If no password supplied, generate a temporary one and return it so the org can share it.
    const tempPassword = body.password && body.password.length >= 8 ? body.password : generateWebhookSecret().slice(0, 12);
    const id = crypto.randomUUID();
    await db.prepare('INSERT INTO readers (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
      .bind(id, body.email, await hashPassword(tempPassword), body.name).run();
    return c.json(ok({ id, email: body.email, name: body.name, temp_password: body.password ? undefined : tempPassword }), 201);
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// Org cancels a specific reader's subscription on their behalf.
app.post('/api/billing/tenant/:slug/users/:id/cancel', async (c) => {
  const slug = c.req.param('slug');
  const readerId = c.req.param('id');
  const staff = await getOrgStaff(c, slug);
  if (!staff) return c.json(err(ErrorCode.UNAUTHORIZED, 'Org sign-in required'), 401);
  try {
    const db = getTenantDb(c.env, slug);
    await ensureBillingColumns(db);
    const immediate = await orgRefundsOnCancel(db);
    const keys = await tenantRazorpayKeys(db, c.env.TENANT_ENCRYPTION_KEY);
    const subs = await db.prepare("SELECT id, razorpay_sub_id FROM reader_subscriptions WHERE reader_id = ? AND status = 'active'")
      .bind(readerId).all<{ id: string; razorpay_sub_id: string | null }>();
    if (!subs.results?.length) return c.json(err(ErrorCode.NOT_FOUND, 'No active subscription for this reader'), 404);
    for (const s of subs.results) await cancelSubscriptionRow(db, s, immediate, keys);
    return c.json(ok({ cancelled: subs.results.length }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// Org lists the refund-request queue.
app.get('/api/billing/tenant/:slug/refund-requests', async (c) => {
  const slug = c.req.param('slug');
  const staff = await getOrgStaff(c, slug);
  if (!staff) return c.json(err(ErrorCode.UNAUTHORIZED, 'Org sign-in required'), 401);
  const status = c.req.query('status'); // optional filter
  try {
    const db = getTenantDb(c.env, slug);
    await ensureBillingColumns(db);
    const base = `SELECT rr.id, rr.reader_id, rr.subscription_id, rr.reader_email, rr.payment_id, rr.reason,
               rr.status, rr.refund_amount_paise, rr.staff_message, rr.razorpay_refund_id, rr.created_at, rr.processed_at,
               s.plan_type, s.last_payment_id, s.current_start
        FROM reader_refund_requests rr
        LEFT JOIN reader_subscriptions s ON s.id = rr.subscription_id`;
    const stmt = status
      ? db.prepare(`${base} WHERE rr.status = ? ORDER BY rr.created_at DESC`).bind(status)
      : db.prepare(`${base} ORDER BY rr.created_at DESC`);
    const rows = await stmt.all();
    return c.json(ok({ items: rows.results }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// Org approves (issues a custom-amount Razorpay refund) or rejects a request, then emails the reader.
app.post('/api/billing/tenant/:slug/refund-requests/:id/process', async (c) => {
  const slug = c.req.param('slug');
  const reqId = c.req.param('id');
  const staff = await getOrgStaff(c, slug);
  if (!staff) return c.json(err(ErrorCode.UNAUTHORIZED, 'Org sign-in required'), 401);
  const body = await c.req.json<{ action: 'approve' | 'reject'; amount_paise?: number; message?: string }>();
  if (body.action !== 'approve' && body.action !== 'reject') {
    return c.json(err(ErrorCode.BAD_REQUEST, 'action must be approve or reject'), 400);
  }
  try {
    const db = getTenantDb(c.env, slug);
    await ensureBillingColumns(db);
    const rr = await db.prepare('SELECT id, reader_id, reader_email, payment_id, status FROM reader_refund_requests WHERE id = ?')
      .bind(reqId).first<{ id: string; reader_id: string; reader_email: string | null; payment_id: string | null; status: string }>();
    if (!rr) return c.json(err(ErrorCode.NOT_FOUND, 'Refund request not found'), 404);
    if (rr.status !== 'requested') return c.json(err(ErrorCode.CONFLICT, `Request already ${rr.status}`), 409);

    const identity = await pubEmailIdentity(db, slug);
    const message = body.message?.trim() || (body.action === 'approve' ? 'Your refund has been processed.' : 'Your refund request could not be approved.');

    let refundId: string | null = null;
    let refundedPaise: number | null = null;

    if (body.action === 'approve') {
      const keys = await tenantRazorpayKeys(db, c.env.TENANT_ENCRYPTION_KEY);
      if (!keys) return c.json(err(ErrorCode.BAD_REQUEST, 'Payments not configured'), 400);
      if (!rr.payment_id) return c.json(err(ErrorCode.BAD_REQUEST, 'No payment on file to refund'), 400);
      // amount_paise null/omitted = full refund; otherwise the staff-set custom amount.
      const amount = typeof body.amount_paise === 'number' && body.amount_paise > 0 ? body.amount_paise : null;
      try {
        const refund = await refundPayment(keys.key_id, keys.key_secret, rr.payment_id, amount, { refund_request_id: rr.id, slug });
        refundId = refund.id;
        refundedPaise = refund.amount ?? amount;
      } catch (e) {
        return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Razorpay refund failed'), 502);
      }
    }

    const newStatus = body.action === 'approve' ? 'refunded' : 'rejected';
    await db.prepare(
      "UPDATE reader_refund_requests SET status=?, refund_amount_paise=?, staff_message=?, razorpay_refund_id=?, processed_by=?, processed_at=CURRENT_TIMESTAMP WHERE id=?"
    ).bind(newStatus, refundedPaise, message, refundId, staff.sub, rr.id).run();

    // Best-effort branded email to the reader (never blocks the refund result).
    if (rr.reader_email) {
      // Per-publication sender: no-reply-<slug>@<verified domain>, display name = publication.
      const domain = c.env.RESEND_DOMAIN || 'payments.epaperspace.com';
      const localSlug = slug.replace(/[^a-z0-9-]/gi, '').toLowerCase();
      const fromAddr = `no-reply-${localSlug}@${domain}`;
      await sendEmail(c.env.RESEND_API_KEY, fromAddr, {
        to: rr.reader_email,
        fromName: identity.displayName,
        replyTo: identity.supportEmail ?? undefined,
        tags: [{ name: 'lane', value: 'reader_refund' }, { name: 'slug', value: localSlug || 'unknown' }],
        subject: body.action === 'approve' ? `Your ${identity.displayName} refund` : `Your ${identity.displayName} refund request`,
        html: refundEmailHtml({
          brandName: identity.displayName,
          approved: body.action === 'approve',
          amountRupees: refundedPaise != null ? (refundedPaise / 100).toFixed(2) : undefined,
          message,
        }),
      });
    }

    return c.json(ok({ status: newStatus, razorpay_refund_id: refundId, refund_amount_paise: refundedPaise }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// Org removes a reader account entirely.
app.delete('/api/billing/tenant/:slug/users/:id', async (c) => {
  const slug = c.req.param('slug');
  const readerId = c.req.param('id');
  const staff = await getOrgStaff(c, slug);
  if (!staff) return c.json(err(ErrorCode.UNAUTHORIZED, 'Org sign-in required'), 401);
  try {
    const db = getTenantDb(c.env, slug);
    await db.batch([
      db.prepare('DELETE FROM reader_subscriptions WHERE reader_id = ?').bind(readerId),
      db.prepare('DELETE FROM readers WHERE id = ?').bind(readerId),
    ]);
    return c.json(ok({ deleted: true }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

export default {
  fetch: app.fetch,
};

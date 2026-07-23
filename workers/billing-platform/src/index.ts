import { Hono } from 'hono';
import { ok, err, ErrorCode } from '@epaper/types';
import { verifySubscriptionSignature } from './razorpay';
import { sendEmail, refundEmailHtml } from './email';
import { runSmsBillingSweep } from './sms-billing';

export interface Env {
  CONTROL_DB: D1Database;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  PLATFORM_NAME?: string;
  PLATFORM_SUPPORT_EMAIL?: string;
  // Resend (Svix) webhook signing secret, format "whsec_<base64>".
  RESEND_WEBHOOK_SECRET?: string;
  // Optional exchangerate.host access key for the metered-SMS FX conversion.
  EXCHANGERATE_ACCESS_KEY?: string;
}

const app = new Hono<{ Bindings: Env }>();

// Idempotent schema guards for the refund flow (control DB may predate these).
async function ensureRefundSchema(db: D1Database) {
  await db.prepare('ALTER TABLE tenants ADD COLUMN last_payment_id TEXT').run().catch(() => {});
  // Plan-change refund credit: the superseded (old plan) charge captured at upgrade time.
  await db.prepare('ALTER TABLE tenants ADD COLUMN upgrade_refund_payment_id TEXT').run().catch(() => {});
  await db.prepare('ALTER TABLE tenants ADD COLUMN upgrade_refund_amount_paise INTEGER').run().catch(() => {});
  await db.prepare(`CREATE TABLE IF NOT EXISTS platform_refund_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    tenant_email TEXT,
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
  // Suggested (max) refund amount to autofill, and the request kind (plan_change vs standard).
  await db.prepare('ALTER TABLE platform_refund_requests ADD COLUMN suggested_amount_paise INTEGER').run().catch(() => {});
  await db.prepare("ALTER TABLE platform_refund_requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'standard'").run().catch(() => {});
  // Resend delivery-status events (portal email monitoring).
  await db.prepare(`CREATE TABLE IF NOT EXISTS email_events (
    id TEXT PRIMARY KEY,
    resend_email_id TEXT,
    event_type TEXT NOT NULL,
    recipient TEXT,
    subject TEXT,
    lane TEXT,
    slug TEXT,
    payload TEXT,
    occurred_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run().catch(() => {});
  await db.prepare('CREATE INDEX IF NOT EXISTS idx_email_events_email ON email_events(resend_email_id)').run().catch(() => {});
}

async function razorpayRequest(env: Env, path: string, method: string = 'GET', body?: any) {
  const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
  const url = `https://api.razorpay.com/v1/${path}`;
  
  const options: RequestInit = {
    method,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  };
  if (body) options.body = JSON.stringify(body);
  
  const res = await fetch(url, options);
  return res;
}

async function verifyWebhookSignature(payload: string, signature: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  
  const signatureBytes = new Uint8Array(signature.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  
  return crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    encoder.encode(payload)
  );
}

// Verify a Resend/Svix webhook signature. Signed content is `${id}.${timestamp}.${body}`,
// HMAC-SHA256 with the base64 secret (the part after the "whsec_" prefix). The svix-signature
// header is space-separated "v1,<base64sig>" entries — any match passes.
async function verifySvixSignature(secret: string, svixId: string, svixTs: string, body: string, sigHeader: string): Promise<boolean> {
  const secretB64 = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const keyBytes = Uint8Array.from(atob(secretB64), (ch) => ch.charCodeAt(0));
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${svixId}.${svixTs}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return sigHeader.split(' ').some((part) => {
    const val = part.includes(',') ? part.split(',')[1] : part;
    return val === expected;
  });
}

// Resend webhook: record email delivery-status events for portal monitoring.
app.post('/api/billing/platform/resend-webhook', async (c) => {
  const secret = c.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return c.json(err(ErrorCode.BAD_REQUEST, 'Webhook not configured'), 400);
  const svixId = c.req.header('svix-id');
  const svixTs = c.req.header('svix-timestamp');
  const svixSig = c.req.header('svix-signature');
  if (!svixId || !svixTs || !svixSig) return c.json(err(ErrorCode.UNAUTHORIZED, 'Missing signature headers'), 401);

  const raw = await c.req.text();
  const valid = await verifySvixSignature(secret, svixId, svixTs, raw, svixSig);
  if (!valid) return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid signature'), 401);

  await ensureRefundSchema(c.env.CONTROL_DB);
  let event: any;
  try { event = JSON.parse(raw); } catch { return c.json(err(ErrorCode.BAD_REQUEST, 'Bad JSON'), 400); }

  const data = event.data ?? {};
  const tags: Record<string, string> = {};
  // Resend echoes tags either as an array of {name,value} or an object, depending on API version.
  if (Array.isArray(data.tags)) for (const t of data.tags) { if (t?.name) tags[t.name] = t.value; }
  else if (data.tags && typeof data.tags === 'object') Object.assign(tags, data.tags);

  const recipient = Array.isArray(data.to) ? data.to.join(', ') : (data.to ?? null);
  // Idempotent on (email id + event type): Resend may retry deliveries.
  await c.env.CONTROL_DB.prepare(
    'INSERT OR IGNORE INTO email_events (id, resend_email_id, event_type, recipient, subject, lane, slug, payload, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    `${data.email_id ?? crypto.randomUUID()}:${event.type ?? 'unknown'}`,
    data.email_id ?? null,
    event.type ?? 'unknown',
    recipient,
    data.subject ?? null,
    tags.lane ?? null,
    tags.slug ?? null,
    raw,
    event.created_at ?? null,
  ).run();

  return c.json(ok({ recorded: true }));
});

// Internal (admin-worker proxied, superadmin): list email delivery events.
app.get('/internal/billing/platform/email-events', async (c) => {
  await ensureRefundSchema(c.env.CONTROL_DB);
  const lane = c.req.query('lane');
  const slug = c.req.query('slug');
  const clauses: string[] = [];
  const binds: string[] = [];
  if (lane) { clauses.push('lane = ?'); binds.push(lane); }
  if (slug) { clauses.push('slug = ?'); binds.push(slug); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = await c.env.CONTROL_DB.prepare(
    `SELECT id, resend_email_id, event_type, recipient, subject, lane, slug, occurred_at, created_at FROM email_events ${where} ORDER BY created_at DESC LIMIT 200`
  ).bind(...binds).all();
  return c.json(ok({ items: rows.results }));
});

app.get('/api/billing/platform/plans', async (c) => {
  const { results } = await c.env.CONTROL_DB.prepare(
    'SELECT * FROM platform_tiers WHERE price_inr > 0 ORDER BY price_inr ASC'
  ).all();

  const items = results.map((t: any) => {
    const totalInr = t.price_inr + (t.price_inr * ((t.tax_percentage || 0) / 100));
    const amountPaise = Math.round(totalInr * 100);
    return {
      id: t.razorpay_plan_id,
      period: (t.billing_cycle || 'monthly').toLowerCase(),
      interval: 1,
      item: {
        name: t.name,
        amount: amountPaise,
        unit_amount: amountPaise,
        currency: 'INR',
        description: `Storage: ${t.max_storage_mb >= 1024 ? `${(t.max_storage_mb / 1024).toFixed(1).replace('.0', '')} GB` : `${t.max_storage_mb} MB`} | Views: ${t.max_views_per_day}/day`
      }
    };
  });

  return c.json(ok({ entity: 'collection', count: items.length, items }));
});

app.post('/api/billing/platform/subscribe', async (c) => {
  const { slug, plan_id } = await c.req.json();
  if (!slug || !plan_id) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing slug or plan_id'), 400);

  const tenant = await c.env.CONTROL_DB.prepare(
    'SELECT id, name, email, razorpay_sub_id FROM tenants WHERE slug = ?'
  ).bind(slug).first<{ id: string; name: string; email: string; razorpay_sub_id: string | null }>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);

  let activeSubId = '';
  if (tenant.razorpay_sub_id) {
    const existingSubRes = await razorpayRequest(c.env, `subscriptions/${tenant.razorpay_sub_id}`);
    if (existingSubRes.ok) {
      const existingSub = await existingSubRes.json() as any;
      if (['active', 'authenticated'].includes(existingSub.status)) {
        activeSubId = tenant.razorpay_sub_id;
      } else {
        activeSubId = existingSub.notes?.old_sub_id || '';
      }
    }
  }

  // Create Razorpay Subscription — e-mandate / auto-debit enabled via subscription checkout.
  const res = await razorpayRequest(c.env, 'subscriptions', 'POST', {
    plan_id,
    total_count: 100, // Razorpay allows max 100 total_count
    customer_notify: 1,
    notify_info: {
      notify_email: tenant.email,
    },
    notes: {
      old_sub_id: activeSubId
    }
  });

  if (!res.ok) {
    const detail = await res.text();
    return c.json(err(ErrorCode.INTERNAL_ERROR, `Failed to create subscription: ${detail}`), 500);
  }

  const sub = await res.json() as any;

  // Persist subscription ID so webhook events can be matched to the tenant.
  await c.env.CONTROL_DB.prepare(
    'UPDATE tenants SET razorpay_plan_id = ?, razorpay_sub_id = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
  ).bind(plan_id, sub.id, slug).run();

  // Return key_id alongside subscription_id so the frontend can open the Razorpay modal.
  return c.json(ok({ subscription_id: sub.id, key_id: c.env.RAZORPAY_KEY_ID }));
});

// Verify Razorpay subscription checkout callback and mark the tenant as actively billed.
app.post('/api/billing/platform/verify-payment', async (c) => {
  const body = await c.req.json<{
    slug: string;
    razorpay_payment_id: string;
    razorpay_subscription_id: string;
    razorpay_signature: string;
  }>();

  if (!body.slug || !body.razorpay_payment_id || !body.razorpay_subscription_id || !body.razorpay_signature) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Missing required payment fields'), 400);
  }

  // Verify HMAC-SHA256(payment_id + "|" + subscription_id, KEY_SECRET)
  const valid = await verifySubscriptionSignature(
    body.razorpay_payment_id,
    body.razorpay_subscription_id,
    body.razorpay_signature,
    c.env.RAZORPAY_KEY_SECRET
  );
  if (!valid) return c.json(err(ErrorCode.UNAUTHORIZED, 'Payment signature verification failed'), 401);

  // Fetch the subscription from Razorpay to get the linked plan.
  const subRes = await razorpayRequest(c.env, `subscriptions/${body.razorpay_subscription_id}`);
  if (!subRes.ok) return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to fetch subscription from Razorpay'), 500);
  const sub = await subRes.json() as any;

  await ensureRefundSchema(c.env.CONTROL_DB);
  // Snapshot the tenant BEFORE we overwrite last_payment_id — the current value is the
  // charge for the plan being superseded by this upgrade.
  const prevTenant = await c.env.CONTROL_DB.prepare('SELECT id, last_payment_id FROM tenants WHERE slug = ?')
    .bind(body.slug).first<{ id: string; last_payment_id: string | null }>();

  // Cancel old subscription if this is an upgrade/downgrade
  const oldSubId = sub.notes?.old_sub_id;
  let upgradePaymentId: string | null = null;
  let upgradeAmountPaise: number | null = null;
  if (oldSubId && oldSubId !== body.razorpay_subscription_id) {
    try {
      const oldSubRes = await razorpayRequest(c.env, `subscriptions/${oldSubId}`);
      if (oldSubRes.ok) {
        const oldSub = await oldSubRes.json() as any;
        if (['active', 'authenticated'].includes(oldSub.status)) {
          await razorpayRequest(c.env, `subscriptions/${oldSubId}/cancel`, 'POST', { cancel_at_cycle_end: 0 });
          console.log(`Cancelled old subscription ${oldSubId} after upgrade to ${body.razorpay_subscription_id}`);
        }
        // Plan-change refund credit: the superseded plan's charge is now "wasted" money the
        // tenant can request back. Prefer the actual payment; fall back to the old plan amount.
        upgradePaymentId = prevTenant?.last_payment_id ?? null;
        if (upgradePaymentId) {
          const payRes = await razorpayRequest(c.env, `payments/${upgradePaymentId}`);
          if (payRes.ok) upgradeAmountPaise = (await payRes.json() as any).amount ?? null;
        }
        if (upgradeAmountPaise == null && oldSub.plan_id) {
          const oldPlanRes = await razorpayRequest(c.env, `plans/${oldSub.plan_id}`);
          if (oldPlanRes.ok) upgradeAmountPaise = (await oldPlanRes.json() as any).item?.amount ?? null;
        }
      }
    } catch (e) {
      console.error('Failed to cancel old subscription on upgrade', e);
    }
  }

  // Fetch the plan name so we can set tenant.plan accordingly.
  const planRes = await razorpayRequest(c.env, `plans/${sub.plan_id}`);
  const planName: string = planRes.ok ? ((await planRes.json() as any).item?.name ?? 'paid').toLowerCase() : 'paid';

  // Mark tenant as active with the verified subscription. If this was an upgrade, also record
  // the superseded charge as a refundable plan-change credit (kept if not already claimed).
  const tenantObj = prevTenant;
  await c.env.CONTROL_DB.prepare(
    `UPDATE tenants SET razorpay_sub_id = ?, razorpay_plan_id = ?, plan = ?, last_payment_id = ?,
       upgrade_refund_payment_id = COALESCE(?, upgrade_refund_payment_id),
       upgrade_refund_amount_paise = COALESCE(?, upgrade_refund_amount_paise),
       updated_at = CURRENT_TIMESTAMP WHERE slug = ?`
  ).bind(body.razorpay_subscription_id, sub.plan_id, planName, body.razorpay_payment_id,
         upgradePaymentId, upgradeAmountPaise, body.slug).run();

  if (tenantObj) {
    const amount = planName === 'starter' ? 117900 : planName === 'growth' ? 589900 : 0;
    await c.env.CONTROL_DB.prepare(
      'INSERT INTO platform_billing_events (id, tenant_id, event_type, razorpay_event_id, amount_paise, payload) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), tenantObj.id, 'subscription.activated', body.razorpay_payment_id || crypto.randomUUID(), amount, JSON.stringify({ plan: planName })).run();
  }

  return c.json(ok({ verified: true, plan: planName }));
});

app.post('/api/billing/platform/webhook', async (c) => {
  const signature = c.req.header('x-razorpay-signature');
  if (!signature) return c.json(err(ErrorCode.UNAUTHORIZED, 'Missing signature'), 401);
  
  const payloadStr = await c.req.text();
  const isValid = await verifyWebhookSignature(payloadStr, signature, c.env.RAZORPAY_WEBHOOK_SECRET);
  if (!isValid) return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid signature'), 401);

  let event: any;
  try { event = JSON.parse(payloadStr); } catch { return c.json(err(ErrorCode.BAD_REQUEST, 'Bad JSON'), 400); }

  // Razorpay's per-event idempotency key is the x-razorpay-event-id header. The webhook
  // body has NO top-level `id`, and `account_id` is constant per merchant ??? using either as
  // the UNIQUE razorpay_event_id made the 2nd event ever collide (500 -> Razorpay disables
  // the webhook). Fall back to a UUID only if the header is somehow absent.
  const eventId = c.req.header('x-razorpay-event-id') || crypto.randomUUID();

  // Find tenant by subscription ID
  const subId = event.payload?.subscription?.entity?.id;
  if (!subId) return c.json(ok({ processed: false, reason: 'No subscription ID in event' }));

  const tenant = await c.env.CONTROL_DB.prepare('SELECT id FROM tenants WHERE razorpay_sub_id = ?').bind(subId).first();
  if (!tenant) return c.json(ok({ processed: false, reason: 'Tenant not found for subscription' }));

  const amount = event.payload?.payment?.entity?.amount || 0;

  // Capture the payment id on charge so refunds have a target.
  if (event.event === 'subscription.charged') {
    const payId = event.payload?.payment?.entity?.id;
    if (payId) {
      await ensureRefundSchema(c.env.CONTROL_DB);
      await c.env.CONTROL_DB.prepare('UPDATE tenants SET last_payment_id = ? WHERE razorpay_sub_id = ?').bind(payId, subId).run();
    }
  }

  // Idempotent on the Razorpay event id ??? deliveries are retried, so ignore duplicates
  // instead of throwing a UNIQUE violation (which would fail the delivery back to Razorpay).
  await c.env.CONTROL_DB.prepare(
    'INSERT OR IGNORE INTO platform_billing_events (id, tenant_id, event_type, razorpay_event_id, amount_paise, payload) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), (tenant as any).id, event.event, eventId, amount, payloadStr).run();

  return c.json(ok({ processed: true }));
});

app.get('/api/billing/platform/:slug/status', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await c.env.CONTROL_DB.prepare(`
    SELECT t.plan, t.razorpay_plan_id, t.razorpay_sub_id,
           p.max_storage_mb, p.max_views_per_day, p.max_simultaneous_editions, p.max_papers_per_day
    FROM tenants t
    LEFT JOIN platform_tiers p ON LOWER(t.plan) = LOWER(p.name)
    WHERE t.slug = ?
  `).bind(slug).first();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  
  let razorpayStatus = null;
  if (tenant.razorpay_sub_id) {
    const res = await razorpayRequest(c.env, `subscriptions/${tenant.razorpay_sub_id}`);
    if (res.ok) {
      const data = await res.json() as any;
      razorpayStatus = data.status;
    }
  }
  
  return c.json(ok({
    plan: tenant.plan,
    has_subscription: !!tenant.razorpay_sub_id,
    razorpay_status: razorpayStatus,
    limits: {
      storage_mb: tenant.max_storage_mb,
      views_per_day: tenant.max_views_per_day,
      simultaneous_editions: tenant.max_simultaneous_editions,
      papers_per_day: tenant.max_papers_per_day
    }
  }));
});

app.get('/health', (c) => c.json(ok({ status: 'ok', worker: 'billing-platform' })));

// Public, org-staff facing: cancel this tenant's platform subscription.
// Reuses the same Razorpay cancel + DB-clear as the internal delete path.
// `at_cycle_end` (default false) lets the org keep access until the paid period ends.
app.post('/api/billing/platform/:slug/subscription/cancel', async (c) => {
  const slug = c.req.param('slug');
  let atCycleEnd = false;
  try {
    const body = await c.req.json<{ at_cycle_end?: boolean }>();
    atCycleEnd = !!body?.at_cycle_end;
  } catch { /* empty body is fine — default immediate cancel */ }

  const tenant = await c.env.CONTROL_DB.prepare('SELECT id, razorpay_sub_id FROM tenants WHERE slug = ?').bind(slug).first<{ id: string; razorpay_sub_id: string | null }>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  if (!tenant.razorpay_sub_id) return c.json(err(ErrorCode.BAD_REQUEST, 'No active subscription to cancel'), 400);

  const res = await razorpayRequest(c.env, `subscriptions/${tenant.razorpay_sub_id}/cancel`, 'POST', {
    cancel_at_cycle_end: atCycleEnd ? 1 : 0,
  });
  if (!res.ok) {
    console.error('Failed to cancel Razorpay subscription', await res.text());
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to cancel subscription in Razorpay'), 500);
  }

  await c.env.CONTROL_DB.prepare(
    'INSERT INTO platform_billing_events (id, tenant_id, event_type, razorpay_event_id, amount_paise, payload) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), tenant.id, 'subscription.cancelled', `cancel_${tenant.razorpay_sub_id}_${crypto.randomUUID().slice(0, 8)}`, 0, JSON.stringify({ at_cycle_end: atCycleEnd })).run();

  if (atCycleEnd) {
    // Keep plan access until the cycle ends; just record the pending cancel.
    return c.json(ok({ cancelled: true, at_cycle_end: true }));
  }

  await c.env.CONTROL_DB.prepare(
    "UPDATE tenants SET razorpay_plan_id = NULL, razorpay_sub_id = NULL, plan = 'Free', updated_at = CURRENT_TIMESTAMP WHERE slug = ?"
  ).bind(slug).run();

  return c.json(ok({ cancelled: true, at_cycle_end: false }));
});

// ── Refund requests: Publication → Platform ─────────────────────────────────
// A tenant raises a refund request against their last platform charge; a superadmin
// (via the admin worker proxy on the /internal routes) approves with a custom amount + message.

// Tenant raises a refund request. Public-by-slug like the other platform billing routes;
// the tenant portal calls this on the org's behalf.
app.post('/api/billing/platform/:slug/refund-request', async (c) => {
  const slug = c.req.param('slug');
  const { reason } = await c.req.json<{ reason?: string }>().catch(() => ({ reason: '' }));
  await ensureRefundSchema(c.env.CONTROL_DB);
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id, email, last_payment_id, upgrade_refund_payment_id, upgrade_refund_amount_paise FROM tenants WHERE slug = ?')
    .bind(slug).first<{ id: string; email: string | null; last_payment_id: string | null; upgrade_refund_payment_id: string | null; upgrade_refund_amount_paise: number | null }>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);

  // A plan change leaves the superseded charge as the fair refund basis — target it (not the
  // active plan the tenant is currently using), and suggest its amount as the max to credit.
  const isPlanChange = !!tenant.upgrade_refund_payment_id;
  const paymentId = isPlanChange ? tenant.upgrade_refund_payment_id : tenant.last_payment_id;
  const suggested = isPlanChange ? tenant.upgrade_refund_amount_paise : null;
  if (!paymentId) return c.json(err(ErrorCode.BAD_REQUEST, 'No refundable payment on file'), 400);

  const open = await c.env.CONTROL_DB.prepare("SELECT id FROM platform_refund_requests WHERE tenant_id = ? AND status = 'requested'")
    .bind(tenant.id).first();
  if (open) return c.json(err(ErrorCode.CONFLICT, 'A refund request is already pending'), 409);

  const id = crypto.randomUUID();
  await c.env.CONTROL_DB.prepare(
    "INSERT INTO platform_refund_requests (id, tenant_id, slug, tenant_email, payment_id, reason, status, suggested_amount_paise, kind) VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, ?)"
  ).bind(id, tenant.id, slug, tenant.email ?? null, paymentId, reason ?? null, suggested, isPlanChange ? 'plan_change' : 'standard').run();
  return c.json(ok({ id, status: 'requested', kind: isPlanChange ? 'plan_change' : 'standard', suggested_amount_paise: suggested }));
});

// Internal (admin-worker proxied, superadmin-guarded): list the refund queue.
app.get('/internal/billing/platform/refund-requests', async (c) => {
  await ensureRefundSchema(c.env.CONTROL_DB);
  const status = c.req.query('status');
  const stmt = status
    ? c.env.CONTROL_DB.prepare('SELECT * FROM platform_refund_requests WHERE status = ? ORDER BY created_at DESC').bind(status)
    : c.env.CONTROL_DB.prepare('SELECT * FROM platform_refund_requests ORDER BY created_at DESC');
  const rows = await stmt.all();
  return c.json(ok({ items: rows.results }));
});

// Internal (superadmin): approve (custom-amount Razorpay refund) or reject, then email the tenant.
app.post('/internal/billing/platform/refund-requests/:id/process', async (c) => {
  const reqId = c.req.param('id');
  const body = await c.req.json<{ action: 'approve' | 'reject'; amount_paise?: number; message?: string; processed_by?: string }>();
  if (body.action !== 'approve' && body.action !== 'reject') {
    return c.json(err(ErrorCode.BAD_REQUEST, 'action must be approve or reject'), 400);
  }
  await ensureRefundSchema(c.env.CONTROL_DB);
  const rr = await c.env.CONTROL_DB.prepare('SELECT id, tenant_email, payment_id, status FROM platform_refund_requests WHERE id = ?')
    .bind(reqId).first<{ id: string; tenant_email: string | null; payment_id: string | null; status: string }>();
  if (!rr) return c.json(err(ErrorCode.NOT_FOUND, 'Refund request not found'), 404);
  if (rr.status !== 'requested') return c.json(err(ErrorCode.CONFLICT, `Request already ${rr.status}`), 409);

  const brandName = c.env.PLATFORM_NAME || 'Our Platform';
  const message = body.message?.trim() || (body.action === 'approve' ? 'Your refund has been processed.' : 'Your refund request could not be approved.');

  let refundId: string | null = null;
  let refundedPaise: number | null = null;

  if (body.action === 'approve') {
    if (!rr.payment_id) return c.json(err(ErrorCode.BAD_REQUEST, 'No payment on file to refund'), 400);
    const amount = typeof body.amount_paise === 'number' && body.amount_paise > 0 ? body.amount_paise : null;
    const refundBody: Record<string, unknown> = { speed: 'normal', notes: { refund_request_id: rr.id } };
    if (amount != null) refundBody.amount = amount;
    const res = await razorpayRequest(c.env, `payments/${rr.payment_id}/refund`, 'POST', refundBody);
    if (!res.ok) {
      return c.json(err(ErrorCode.INTERNAL_ERROR, `Razorpay refund failed: ${await res.text()}`), 502);
    }
    const refund = await res.json() as any;
    refundId = refund.id;
    refundedPaise = refund.amount ?? amount;
  }

  const newStatus = body.action === 'approve' ? 'refunded' : 'rejected';
  await c.env.CONTROL_DB.prepare(
    'UPDATE platform_refund_requests SET status=?, refund_amount_paise=?, staff_message=?, razorpay_refund_id=?, processed_by=?, processed_at=CURRENT_TIMESTAMP WHERE id=?'
  ).bind(newStatus, refundedPaise, message, refundId, body.processed_by ?? null, rr.id).run();

  // Once a plan-change credit is refunded, clear it so the same superseded charge can't be
  // refunded twice.
  if (body.action === 'approve' && rr.payment_id) {
    await c.env.CONTROL_DB.prepare(
      'UPDATE tenants SET upgrade_refund_payment_id = NULL, upgrade_refund_amount_paise = NULL WHERE upgrade_refund_payment_id = ?'
    ).bind(rr.payment_id).run();
  }

  if (rr.tenant_email) {
    await sendEmail(c.env.RESEND_API_KEY, c.env.RESEND_FROM, {
      to: rr.tenant_email,
      fromName: brandName,
      replyTo: c.env.PLATFORM_SUPPORT_EMAIL,
      tags: [{ name: 'lane', value: 'platform_refund' }],
      subject: body.action === 'approve' ? `Your ${brandName} refund` : `Your ${brandName} refund request`,
      html: refundEmailHtml({
        brandName,
        approved: body.action === 'approve',
        amountRupees: refundedPaise != null ? (refundedPaise / 100).toFixed(2) : undefined,
        message,
      }),
    });
  }

  return c.json(ok({ status: newStatus, razorpay_refund_id: refundId, refund_amount_paise: refundedPaise }));
});

app.post('/internal/billing/platform/plans', async (c) => {
  const { name, price_inr, tax_percentage, billing_cycle } = await c.req.json();
  
  if (!name || price_inr == null || tax_percentage == null || !billing_cycle) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Missing required fields'), 400);
  }

  // Calculate final amount in paise including tax
  const totalInr = price_inr + (price_inr * (tax_percentage / 100));
  const amountPaise = Math.round(totalInr * 100);

  const res = await razorpayRequest(c.env, 'plans', 'POST', {
    period: billing_cycle.toLowerCase() === 'yearly' ? 'yearly' : 'monthly',
    interval: 1,
    item: {
      name: name,
      amount: amountPaise,
      currency: 'INR'
    }
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error('Failed to create Razorpay plan:', errorText);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to create Razorpay plan'), 500);
  }

  const data = await res.json() as { id: string };
  return c.json(ok({ razorpay_plan_id: data.id }));
});

app.patch('/internal/billing/platform/:slug/subscription', async (c) => {
  const slug = c.req.param('slug');
  const { planName } = await c.req.json();
  if (!planName) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing planName'), 400);

  const tenant = await c.env.CONTROL_DB.prepare('SELECT id, razorpay_sub_id FROM tenants WHERE slug = ?').bind(slug).first();
  if (!tenant || !tenant.razorpay_sub_id) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant or subscription not found'), 404);

  // Fetch all plans
  const plansRes = await razorpayRequest(c.env, 'plans');
  if (!plansRes.ok) return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to fetch plans'), 500);
  
  const plansData = await plansRes.json() as any;
  const targetPlan = plansData.items?.find((p: any) => p.item?.name?.toLowerCase() === planName.toLowerCase());
  
  if (!targetPlan) return c.json(err(ErrorCode.NOT_FOUND, `Plan matching name ${planName} not found in Razorpay`), 404);

  // Update subscription in Razorpay
  const updateRes = await razorpayRequest(c.env, `subscriptions/${tenant.razorpay_sub_id}`, 'PATCH', {
    plan_id: targetPlan.id,
    customer_notify: 1
  });

  if (!updateRes.ok) {
    console.error('Failed to update Razorpay subscription', await updateRes.text());
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to update subscription in Razorpay'), 500);
  }

  const sub = await updateRes.json() as any;

  await c.env.CONTROL_DB.prepare(
    'UPDATE tenants SET razorpay_plan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
  ).bind(targetPlan.id, slug).run();

  return c.json(ok({ updated: true, subscription_id: sub.id }));
});

app.delete('/internal/billing/platform/:slug/subscription', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id, razorpay_sub_id FROM tenants WHERE slug = ?').bind(slug).first();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);

  if (tenant.razorpay_sub_id) {
    // Cancel the subscription in Razorpay
    const res = await razorpayRequest(c.env, `subscriptions/${tenant.razorpay_sub_id}/cancel`, 'POST', {
      cancel_at_cycle_end: 0 // cancel immediately
    });
    
    if (!res.ok) {
      console.error('Failed to cancel Razorpay subscription', await res.text());
      return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to cancel subscription in Razorpay'), 500);
    }
  }

  await c.env.CONTROL_DB.prepare(
    "UPDATE tenants SET razorpay_plan_id = NULL, razorpay_sub_id = NULL, plan = 'Free', updated_at = CURRENT_TIMESTAMP WHERE slug = ?"
  ).bind(slug).run();

  return c.json(ok({ cancelled: true }));
});

export default {
  fetch: app.fetch,
  // Monthly SMS metering sweep. Cron is set in wrangler.jsonc (runs at month start);
  // the idempotency key inside billTenantSms makes an accidental extra run a no-op.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const now = new Date();
    const nowIso = now.toISOString();
    const monthKey = nowIso.slice(0, 7); // YYYY-MM
    // Top-level catch: per-tenant errors are handled inside the sweep, but a setup or
    // pre-loop failure (e.g. the ALTER/index/config reads) would otherwise become an
    // unhandled rejection. waitUntil still holds the worker open until it settles.
    ctx.waitUntil(
      runSmsBillingSweep(env, nowIso, monthKey).catch(e =>
        console.error('[sms-billing] sweep failed before/around tenant loop:', e)
      )
    );
  },
};

import { Hono } from 'hono';
import { ok, err, ErrorCode, ReaderJwtPayload, SubscriptionInterval } from '@epaper/types';
import { getTenantDb } from './db';
import { encrypt, decrypt } from './crypto';
import { verifyJwt } from './jwt';
import { createOrder, verifyPaymentSignature } from './razorpay';

export interface Env {
  TENANT_ENCRYPTION_KEY: string;
  ORG_JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

const INTERVAL_MONTHS: Record<SubscriptionInterval, number> = { monthly: 1, '6month': 6, '12month': 12 };

// Resolve the reader from an Authorization: Bearer <reader JWT> header.
async function getReader(c: any, slug: string): Promise<ReaderJwtPayload | null> {
  const auth = c.req.header('Authorization');
  if (!auth?.startsWith('Bearer ')) return null;
  const payload = await verifyJwt(auth.substring(7), c.env.ORG_JWT_SECRET);
  if (!payload || payload.aud !== 'reader' || payload.tenantSlug !== slug || typeof payload.sub !== 'string') return null;
  return payload as unknown as ReaderJwtPayload;
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

app.post('/api/billing/tenant/:slug/config', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();
  
  if (!body.key_id || !body.key_secret) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Missing Razorpay credentials'), 400);
  }
  
  try {
    const db = getTenantDb(c.env, slug);
    const secretEnc = await encrypt(body.key_secret, c.env.TENANT_ENCRYPTION_KEY);
    const webhookEnc = body.webhook_secret ? await encrypt(body.webhook_secret, c.env.TENANT_ENCRYPTION_KEY) : null;
    
    // Upsert config (id is always 1)
    await db.prepare(`
      INSERT INTO razorpay_config (id, key_id, key_secret_enc, webhook_secret_enc, updated_at) 
      VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET 
        key_id=excluded.key_id, 
        key_secret_enc=excluded.key_secret_enc, 
        webhook_secret_enc=excluded.webhook_secret_enc, 
        updated_at=CURRENT_TIMESTAMP
    `).bind(body.key_id, secretEnc, webhookEnc).run();
    
    return c.json(ok({ configured: true }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

app.get('/api/billing/tenant/:slug/config', async (c) => {
  const slug = c.req.param('slug');
  
  try {
    const db = getTenantDb(c.env, slug);
    const config = await db.prepare('SELECT key_id, updated_at FROM razorpay_config WHERE id = 1').first();
    
    if (!config) return c.json(ok(null)); // Not configured yet
    return c.json(ok(config)); // Only return safe fields
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
    
    // In a real implementation, you'd match this against reader subscriptions
    // For now, just log the event
    await db.prepare(
      'INSERT INTO reader_billing_events (id, subscription_id, event_type, razorpay_event_id, amount_paise, payload) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), 'dummy-sub-id', event.event, event.account_id || event.id, event.payload?.payment?.entity?.amount || 0, payloadStr).run();
    
    return c.json(ok({ processed: true }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// Reader-facing: create a Razorpay order for a plan, billed to the tenant's own account.
app.post('/api/billing/tenant/:slug/reader/subscribe', async (c) => {
  const slug = c.req.param('slug');
  const reader = await getReader(c, slug);
  if (!reader) return c.json(err(ErrorCode.UNAUTHORIZED, 'Sign in to subscribe'), 401);

  const { plan_id } = await c.req.json<{ plan_id: string }>();
  if (!plan_id) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing plan_id'), 400);

  try {
    const db = getTenantDb(c.env, slug);
    const plan = await db.prepare(
      'SELECT id, tier_id, name, interval, price_paise, tax_percentage, offer_pct FROM plans WHERE id = ? AND active = 1'
    ).bind(plan_id).first<{ id: string; tier_id: string; name: string; interval: SubscriptionInterval; price_paise: number; tax_percentage: number; offer_pct: number }>();
    if (!plan) return c.json(err(ErrorCode.NOT_FOUND, 'Plan not found'), 404);

    const keys = await tenantRazorpayKeys(db, c.env.TENANT_ENCRYPTION_KEY);
    if (!keys) return c.json(err(ErrorCode.BAD_REQUEST, 'Publication has not configured payments yet'), 400);

    const amount = finalPaise(plan.price_paise, plan.offer_pct, plan.tax_percentage);
    const order = await createOrder(keys.key_id, keys.key_secret, amount, {
      plan_id: plan.id, tier_id: plan.tier_id, reader_id: reader.sub,
    });

    return c.json(ok({
      order_id: order.id, amount: order.amount, currency: order.currency,
      key_id: keys.key_id, plan: { id: plan.id, name: plan.name, interval: plan.interval },
    }));
  } catch (e) {
    return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Subscribe failed'), 500);
  }
});

// Reader-facing: verify a completed Razorpay payment and activate the subscription.
app.post('/api/billing/tenant/:slug/reader/verify', async (c) => {
  const slug = c.req.param('slug');
  const reader = await getReader(c, slug);
  if (!reader) return c.json(err(ErrorCode.UNAUTHORIZED, 'Sign in to subscribe'), 401);

  const body = await c.req.json<{ plan_id: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }>();
  if (!body.plan_id || !body.razorpay_order_id || !body.razorpay_payment_id || !body.razorpay_signature) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Missing payment fields'), 400);
  }

  try {
    const db = getTenantDb(c.env, slug);
    const plan = await db.prepare('SELECT id, tier_id, interval FROM plans WHERE id = ?')
      .bind(body.plan_id).first<{ id: string; tier_id: string; interval: SubscriptionInterval }>();
    if (!plan) return c.json(err(ErrorCode.NOT_FOUND, 'Plan not found'), 404);

    const keys = await tenantRazorpayKeys(db, c.env.TENANT_ENCRYPTION_KEY);
    if (!keys) return c.json(err(ErrorCode.BAD_REQUEST, 'Payments not configured'), 400);

    const valid = await verifyPaymentSignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, keys.key_secret);
    if (!valid) return c.json(err(ErrorCode.UNAUTHORIZED, 'Payment verification failed'), 401);

    const months = INTERVAL_MONTHS[plan.interval] ?? 1;
    const now = new Date();
    const end = new Date(now); end.setMonth(end.getMonth() + months);

    const id = crypto.randomUUID();
    await db.prepare(
      `INSERT INTO reader_subscriptions
         (id, reader_id, razorpay_sub_id, plan_type, tier_id, plan_id, status, current_start, current_end)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    ).bind(id, reader.sub, body.razorpay_payment_id, plan.interval, plan.tier_id, plan.id,
           now.toISOString(), end.toISOString()).run();

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

export default {
  fetch: app.fetch,
};

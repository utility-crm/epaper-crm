import { Hono } from 'hono';
import { ok, err, ErrorCode } from '@epaper/types';
import { getTenantDb } from './db';
import { encrypt, decrypt } from './crypto';

export interface Env {
  TENANT_ENCRYPTION_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

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

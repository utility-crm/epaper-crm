import { Hono } from 'hono';
import { ok, err, ErrorCode } from '@epaper/types';

export interface Env {
  CONTROL_DB: D1Database;
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET: string;
}

const app = new Hono<{ Bindings: Env }>();

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

app.get('/api/billing/platform/plans', async (c) => {
  const res = await razorpayRequest(c.env, 'plans');
  if (!res.ok) return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to fetch plans from Razorpay'), 500);
  const data = await res.json();
  return c.json(ok(data));
});

app.post('/api/billing/platform/subscribe', async (c) => {
  const { slug, tier_id } = await c.req.json();
  if (!slug || !tier_id) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing slug or tier_id'), 400);
  
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id, email FROM tenants WHERE slug = ?').bind(slug).first();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  
  const tier = await c.env.CONTROL_DB.prepare('SELECT name, razorpay_plan_id FROM platform_tiers WHERE id = ?').bind(tier_id).first();
  if (!tier || !tier.razorpay_plan_id) return c.json(err(ErrorCode.NOT_FOUND, 'Tier or Razorpay plan not found'), 404);

  // Create subscription in Razorpay
  const res = await razorpayRequest(c.env, 'subscriptions', 'POST', {
    plan_id: tier.razorpay_plan_id,
    total_count: 120, // 10 years
    customer_notify: 1
  });
  
  if (!res.ok) return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to create subscription'), 500);
  
  const sub = await res.json() as any;
  
  await c.env.CONTROL_DB.prepare(
    'UPDATE tenants SET plan = ?, razorpay_plan_id = ?, razorpay_sub_id = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
  ).bind(tier.name, tier.razorpay_plan_id, sub.id, slug).run();
  
  return c.json(ok({ subscription_id: sub.id }));
});

app.post('/api/billing/platform/webhook', async (c) => {
  const signature = c.req.header('x-razorpay-signature');
  if (!signature) return c.json(err(ErrorCode.UNAUTHORIZED, 'Missing signature'), 401);
  
  const payloadStr = await c.req.text();
  const isValid = await verifyWebhookSignature(payloadStr, signature, c.env.RAZORPAY_WEBHOOK_SECRET);
  if (!isValid) return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid signature'), 401);
  
  const event = JSON.parse(payloadStr);
  
  // Find tenant by subscription ID
  const subId = event.payload?.subscription?.entity?.id;
  if (!subId) return c.json(ok({ processed: false, reason: 'No subscription ID in event' }));
  
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id FROM tenants WHERE razorpay_sub_id = ?').bind(subId).first();
  if (!tenant) return c.json(ok({ processed: false, reason: 'Tenant not found for subscription' }));
  
  const amount = event.payload?.payment?.entity?.amount || 0;
  
  await c.env.CONTROL_DB.prepare(
    'INSERT INTO platform_billing_events (id, tenant_id, event_type, razorpay_event_id, amount_paise, payload) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(crypto.randomUUID(), (tenant as any).id, event.event, event.account_id || event.id, amount, payloadStr).run();
  
  return c.json(ok({ processed: true }));
});

app.get('/api/billing/platform/:slug/status', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await c.env.CONTROL_DB.prepare('SELECT plan, razorpay_plan_id, razorpay_sub_id FROM tenants WHERE slug = ?').bind(slug).first();
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
    razorpay_status: razorpayStatus
  }));
});

app.get('/health', (c) => c.json(ok({ status: 'ok', worker: 'billing-platform' })));

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

export default {
  fetch: app.fetch,
};

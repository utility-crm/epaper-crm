import { Hono } from 'hono';
import { ok, err, ErrorCode } from '@epaper/types';
import { verifySubscriptionSignature } from './razorpay';

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
    'SELECT id, name, email FROM tenants WHERE slug = ?'
  ).bind(slug).first<{ id: string; name: string; email: string }>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);

  // Create Razorpay Subscription — e-mandate / auto-debit enabled via subscription checkout.
  const res = await razorpayRequest(c.env, 'subscriptions', 'POST', {
    plan_id,
    total_count: 100, // Razorpay allows max 100 total_count
    customer_notify: 1,
    notify_info: {
      notify_email: tenant.email,
    },
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

  // Fetch the plan name so we can set tenant.plan accordingly.
  const planRes = await razorpayRequest(c.env, `plans/${sub.plan_id}`);
  const planName: string = planRes.ok ? ((await planRes.json() as any).item?.name ?? 'paid').toLowerCase() : 'paid';

  // Mark tenant as active with the verified subscription.
  const tenantObj = await c.env.CONTROL_DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(body.slug).first<{ id: string }>();
  await c.env.CONTROL_DB.prepare(
    'UPDATE tenants SET razorpay_sub_id = ?, razorpay_plan_id = ?, plan = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
  ).bind(body.razorpay_subscription_id, sub.plan_id, planName, body.slug).run();

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
    'UPDATE tenants SET razorpay_plan_id = NULL, razorpay_sub_id = NULL, plan = NULL, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
  ).bind(slug).run();

  return c.json(ok({ cancelled: true, at_cycle_end: false }));
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
    'UPDATE tenants SET razorpay_plan_id = NULL, razorpay_sub_id = NULL, plan = NULL, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
  ).bind(slug).run();

  return c.json(ok({ cancelled: true }));
});

export default {
  fetch: app.fetch,
};

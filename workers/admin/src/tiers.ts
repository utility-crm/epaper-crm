import { Hono } from 'hono';
import { Env, adminAuth } from './middleware';
import { ok, err, ErrorCode } from '@epaper/types';

export const tiersRouter = new Hono<{ Bindings: Env; Variables: { adminId: string; adminRole: string } }>();

const requireSuperadmin = async (c: any, next: any) => {
  if (c.var.adminRole !== 'superadmin') {
    return c.json(err(ErrorCode.FORBIDDEN, 'Requires superadmin role'), 403);
  }
  await next();
};

tiersRouter.use('/', async (c, next) => {
  if (c.req.method === 'GET') {
    return next();
  }
  return next();
});

const adminOnly = async (c: any, next: any) => {
  await adminAuth(c, async () => {
    await requireSuperadmin(c, next);
  });
};

tiersRouter.use('*', async (c, next) => {
  if (c.req.method !== 'GET') {
    return adminOnly(c, next);
  }
  return next();
});

tiersRouter.get('/', async (c) => {
  const { results } = await c.env.CONTROL_DB.prepare('SELECT * FROM platform_tiers ORDER BY max_storage_mb ASC').all();
  
  // Parse features JSON for each tier
  const parsedResults = results.map((tier: any) => ({
    ...tier,
    features: tier.features ? JSON.parse(tier.features) : []
  }));
  
  return c.json(ok(parsedResults));
});

tiersRouter.post('/', async (c) => {
  const body = await c.req.json();
  const id = `tier_${crypto.randomUUID()}`;
  
  let razorpayPlanId = body.razorpay_plan_id || null;
  const priceInr = body.price_inr || 0;
  const taxPct = body.tax_percentage || 0;
  const cycle = body.billing_cycle || 'monthly';

  if (priceInr > 0) {
    try {
      const internalReq = new Request('http://internal/internal/billing/platform/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: body.name, price_inr: priceInr, tax_percentage: taxPct, billing_cycle: cycle })
      });
      const res = await c.env.BILLING_PLATFORM_WORKER.fetch(internalReq);
      if (res.ok) {
        const data = await res.json() as any;
        if (data.data?.razorpay_plan_id) razorpayPlanId = data.data.razorpay_plan_id;
      } else {
        const detail = await res.text().catch(() => 'unknown error');
        return c.json(err(ErrorCode.INTERNAL_ERROR, `Failed to create Razorpay plan: ${detail}`), 502);
      }
    } catch (e: any) {
      return c.json(err(ErrorCode.INTERNAL_ERROR, `Billing worker unreachable — ensure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET secrets are set on the billing-platform worker. (${e?.message ?? 'fetch failed'})`), 502);
    }
  }

  const featuresJson = JSON.stringify(body.features || []);

  try {
    await c.env.CONTROL_DB.prepare(
      `INSERT INTO platform_tiers (id, name, max_storage_mb, max_views_per_day, max_simultaneous_editions, max_papers_per_day, razorpay_plan_id, price_inr, tax_percentage, billing_cycle, features)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, body.name, body.max_storage_mb, body.max_views_per_day,
      body.max_simultaneous_editions, body.max_papers_per_day, razorpayPlanId,
      priceInr, taxPct, cycle, featuresJson
    ).run();
  } catch (e: any) {
    if (e.message.includes('UNIQUE')) return c.json(err(ErrorCode.CONFLICT, 'Tier name already exists'), 409);
    throw e;
  }

  return c.json(ok({ id, ...body, razorpay_plan_id: razorpayPlanId, price_inr: priceInr, tax_percentage: taxPct, billing_cycle: cycle, features: body.features || [] }));
});


tiersRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  let razorpayPlanId = body.razorpay_plan_id || null;
  const priceInr = body.price_inr || 0;
  const taxPct = body.tax_percentage || 0;
  const cycle = body.billing_cycle || 'monthly';
  const featuresJson = JSON.stringify(body.features || []);

  // Find existing to see if price changed
  const existing = await c.env.CONTROL_DB.prepare('SELECT price_inr, tax_percentage, billing_cycle, razorpay_plan_id FROM platform_tiers WHERE id = ?').bind(id).first() as any;
  if (!existing) return c.json(err(ErrorCode.NOT_FOUND, 'Tier not found'), 404);

  // If price or cycle changed, we must create a NEW Razorpay plan
  if (priceInr > 0 && (existing.price_inr !== priceInr || existing.tax_percentage !== taxPct || existing.billing_cycle !== cycle || !existing.razorpay_plan_id)) {
    try {
      const internalReq = new Request('http://internal/internal/billing/platform/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: body.name, price_inr: priceInr, tax_percentage: taxPct, billing_cycle: cycle })
      });
      const res = await c.env.BILLING_PLATFORM_WORKER.fetch(internalReq);
      if (res.ok) {
        const data = await res.json() as any;
        if (data.data?.razorpay_plan_id) razorpayPlanId = data.data.razorpay_plan_id;
      } else {
        const detail = await res.text().catch(() => 'unknown error');
        return c.json(err(ErrorCode.INTERNAL_ERROR, `Failed to update Razorpay plan: ${detail}`), 502);
      }
    } catch (e: any) {
      return c.json(err(ErrorCode.INTERNAL_ERROR, `Billing worker unreachable — ensure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET secrets are set on the billing-platform worker. (${e?.message ?? 'fetch failed'})`), 502);
    }
  } else if (priceInr === 0) {
    razorpayPlanId = null;
  }

  await c.env.CONTROL_DB.prepare(
    `UPDATE platform_tiers SET name = ?, max_storage_mb = ?, max_views_per_day = ?, max_simultaneous_editions = ?, max_papers_per_day = ?, razorpay_plan_id = ?, price_inr = ?, tax_percentage = ?, billing_cycle = ?, features = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(
    body.name, body.max_storage_mb, body.max_views_per_day,
    body.max_simultaneous_editions, body.max_papers_per_day, razorpayPlanId,
    priceInr, taxPct, cycle, featuresJson, id
  ).run();

  return c.json(ok({ id, ...body, razorpay_plan_id: razorpayPlanId, price_inr: priceInr, tax_percentage: taxPct, billing_cycle: cycle, features: body.features || [] }));
});

// Backfill: create real Razorpay plans for any paid tier missing a razorpay_plan_id
// (e.g. tiers inserted via seed_tiers.sql, which bypasses the create/update flow).
// Without this, the platform billing page shows disabled Subscribe buttons because
// checkout needs a Razorpay plan id. Superadmin-only (all non-GET routes are guarded).
tiersRouter.post('/backfill-razorpay', async (c) => {
  const { results } = await c.env.CONTROL_DB.prepare(
    'SELECT id, name, price_inr, tax_percentage, billing_cycle FROM platform_tiers WHERE price_inr > 0 AND (razorpay_plan_id IS NULL OR razorpay_plan_id = "")'
  ).all<{ id: string; name: string; price_inr: number; tax_percentage: number; billing_cycle: string }>();

  const fixed: { id: string; name: string; razorpay_plan_id: string }[] = [];
  const failed: { id: string; name: string; error: string }[] = [];

  for (const tier of results) {
    try {
      const internalReq = new Request('http://internal/internal/billing/platform/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tier.name,
          price_inr: tier.price_inr,
          tax_percentage: tier.tax_percentage ?? 0,
          billing_cycle: tier.billing_cycle || 'monthly',
        }),
      });
      const res = await c.env.BILLING_PLATFORM_WORKER.fetch(internalReq);
      if (!res.ok) {
        failed.push({ id: tier.id, name: tier.name, error: await res.text().catch(() => 'unknown error') });
        continue;
      }
      const data = await res.json() as any;
      const planId = data.data?.razorpay_plan_id;
      if (!planId) {
        failed.push({ id: tier.id, name: tier.name, error: 'No razorpay_plan_id returned' });
        continue;
      }
      await c.env.CONTROL_DB.prepare('UPDATE platform_tiers SET razorpay_plan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(planId, tier.id).run();
      fixed.push({ id: tier.id, name: tier.name, razorpay_plan_id: planId });
    } catch (e: any) {
      failed.push({ id: tier.id, name: tier.name, error: e?.message ?? 'fetch failed' });
    }
  }

  return c.json(ok({ fixed, failed, checked: results.length }));
});

tiersRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const inUse = await c.env.CONTROL_DB.prepare('SELECT count(*) as c FROM tenants WHERE plan = (SELECT name FROM platform_tiers WHERE id = ?)')
    .bind(id).first<{c: number}>();
  if (inUse && inUse.c > 0) {
    return c.json(err(ErrorCode.CONFLICT, 'Cannot delete tier currently used by tenants'), 409);
  }
  
  await c.env.CONTROL_DB.prepare('DELETE FROM platform_tiers WHERE id = ?').bind(id).run();
  return c.json(ok({ success: true }));
});

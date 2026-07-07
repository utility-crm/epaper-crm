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
  return c.json(ok(results));
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

  try {
    await c.env.CONTROL_DB.prepare(
      `INSERT INTO platform_tiers (id, name, max_storage_mb, max_views_per_day, max_simultaneous_editions, max_papers_per_day, razorpay_plan_id, price_inr, tax_percentage, billing_cycle)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, body.name, body.max_storage_mb, body.max_views_per_day,
      body.max_simultaneous_editions, body.max_papers_per_day, razorpayPlanId,
      priceInr, taxPct, cycle
    ).run();
  } catch (e: any) {
    if (e.message.includes('UNIQUE')) return c.json(err(ErrorCode.CONFLICT, 'Tier name already exists'), 409);
    throw e;
  }

  return c.json(ok({ id, ...body, razorpay_plan_id: razorpayPlanId, price_inr: priceInr, tax_percentage: taxPct, billing_cycle: cycle }));
});


tiersRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  let razorpayPlanId = body.razorpay_plan_id || null;
  const priceInr = body.price_inr || 0;
  const taxPct = body.tax_percentage || 0;
  const cycle = body.billing_cycle || 'monthly';

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
    `UPDATE platform_tiers SET name = ?, max_storage_mb = ?, max_views_per_day = ?, max_simultaneous_editions = ?, max_papers_per_day = ?, razorpay_plan_id = ?, price_inr = ?, tax_percentage = ?, billing_cycle = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(
    body.name, body.max_storage_mb, body.max_views_per_day,
    body.max_simultaneous_editions, body.max_papers_per_day, razorpayPlanId,
    priceInr, taxPct, cycle, id
  ).run();

  return c.json(ok({ id, ...body, razorpay_plan_id: razorpayPlanId, price_inr: priceInr, tax_percentage: taxPct, billing_cycle: cycle }));
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

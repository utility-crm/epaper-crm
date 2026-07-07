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
  
  try {
    await c.env.CONTROL_DB.prepare(
      `INSERT INTO platform_tiers (id, name, max_storage_mb, max_views_per_day, max_simultaneous_editions, max_papers_per_day, razorpay_plan_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, body.name, body.max_storage_mb, body.max_views_per_day,
      body.max_simultaneous_editions, body.max_papers_per_day, body.razorpay_plan_id || null
    ).run();
  } catch (e: any) {
    if (e.message.includes('UNIQUE')) return c.json(err(ErrorCode.CONFLICT, 'Tier name already exists'), 409);
    throw e;
  }
  
  return c.json(ok({ id, ...body }));
});

tiersRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  
  await c.env.CONTROL_DB.prepare(
    `UPDATE platform_tiers SET name = ?, max_storage_mb = ?, max_views_per_day = ?, max_simultaneous_editions = ?, max_papers_per_day = ?, razorpay_plan_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(
    body.name, body.max_storage_mb, body.max_views_per_day,
    body.max_simultaneous_editions, body.max_papers_per_day, body.razorpay_plan_id || null, id
  ).run();
  
  return c.json(ok({ id, ...body }));
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

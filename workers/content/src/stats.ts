import { Hono } from 'hono';
import { getTenantDb } from './db';
import { ok, err, ErrorCode } from '@epaper/types';

export const statsRouter = new Hono();

statsRouter.get('/:slug/stats', async (c) => {
  const slug = c.req.param('slug');
  try {
    const db = getTenantDb(c.env, slug);
    const stats = await db.prepare('SELECT disk_usage_bytes, pageviews FROM tenant_stats WHERE id = 1').first();
    if (!stats) return c.json(ok({ disk_usage_bytes: 0, pageviews: 0 }));
    return c.json(ok(stats));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

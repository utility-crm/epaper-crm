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
    console.error(`Error in stats API (${slug}):`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Database error'), 500);
  }
});

statsRouter.post('/:slug/stats/recalculate', async (c) => {
  const slug = c.req.param('slug');
  try {
    const db = getTenantDb(c.env, slug);
    const bucket = getTenantBucket(c.env, slug);
    
    let totalSize = 0;
    let cursor: string | undefined = undefined;
    do {
      const listed = await bucket.list({ cursor });
      for (const object of listed.objects) {
        totalSize += object.size;
      }
      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
    
    await db.prepare('UPDATE tenant_stats SET disk_usage_bytes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').bind(totalSize).run();
    
    return c.json(ok({ disk_usage_bytes: totalSize }));
  } catch (e) {
    console.error(`Error in stats recalculate (${slug}):`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Storage/DB error'), 500);
  }
});

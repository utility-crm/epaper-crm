import { Hono } from 'hono';
import { getTenantDb, getTenantBucket } from './db';
import { ok, err, ErrorCode } from '@epaper/types';

export const uploadRouter = new Hono();

uploadRouter.put('/:slug/epapers/:id/upload', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  
  try {
    const db = getTenantDb(c.env, slug);
    const bucket = getTenantBucket(c.env, slug);
    
    const epaper = await db.prepare('SELECT id FROM epapers WHERE id = ?').bind(id).first();
    if (!epaper) return c.json(err(ErrorCode.NOT_FOUND, 'Epaper not found'), 404);
    
    const contentType = c.req.header('content-type') || 'application/pdf';
    const key = `epapers/${id}/${crypto.randomUUID()}.pdf`;
    
    const obj = await bucket.put(key, c.req.raw.body, {
      httpMetadata: { contentType }
    });
    
    await db.prepare('UPDATE epapers SET r2_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(key, id).run();
    await db.prepare('UPDATE tenant_stats SET disk_usage_bytes = disk_usage_bytes + ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').bind(obj.size).run();
    
    return c.json(ok({ uploaded: true, key }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB/Bucket not found or unavailable'), 403);
  }
});

import { Hono } from 'hono';
import { getTenantDb, getTenantBucket } from './db';
import { ok, err, ErrorCode } from '@epaper/types';

export const uploadRouter = new Hono();

uploadRouter.put('/:slug/editions/:id/upload', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  
  try {
    const db = getTenantDb(c.env, slug);
    const bucket = getTenantBucket(c.env, slug);
    
    const edition = await db.prepare('SELECT id FROM editions WHERE id = ?').bind(id).first();
    if (!edition) return c.json(err(ErrorCode.NOT_FOUND, 'Edition not found'), 404);
    
    const contentType = c.req.header('content-type') || 'application/pdf';
    const key = `editions/${id}/${crypto.randomUUID()}.pdf`;
    
    await bucket.put(key, c.req.raw.body, {
      httpMetadata: { contentType }
    });
    
    await db.prepare('UPDATE editions SET r2_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(key, id).run();
    
    return c.json(ok({ uploaded: true, key }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB/Bucket not found or unavailable'), 403);
  }
});

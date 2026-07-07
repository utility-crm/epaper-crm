import { Hono } from 'hono';
import { getTenantDb, getTenantBucket } from './db';
import { ok, err, ErrorCode } from '@epaper/types';

export const settingsRouter = new Hono<{ Bindings: Record<string, unknown>; Variables: { userId: string } }>();

// Public endpoint — used by reader app for branding
settingsRouter.get('/:slug/settings', async (c) => {
  const slug = c.req.param('slug');
  try {
    const db = getTenantDb(c.env, slug);
    const row = await db.prepare('SELECT * FROM tenant_settings WHERE id = ?').bind('singleton').first();
    return c.json(ok(row ?? { id: 'singleton', org_name: null, logo_url: null, theme_id: 'modern' }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant not found'), 403);
  }
});

// Staff-only: update branding settings (text fields only)
settingsRouter.patch('/:slug/settings', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();
  try {
    const db = getTenantDb(c.env, slug);
    await db.prepare(
      'UPDATE tenant_settings SET org_name = COALESCE(?, org_name), theme_id = COALESCE(?, theme_id), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(body.org_name ?? null, body.theme_id ?? null, 'singleton').run();
    return c.json(ok({ updated: true }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant not found'), 403);
  }
});

// Staff-only: upload logo to R2 and store URL
settingsRouter.put('/:slug/settings/logo', async (c) => {
  const slug = c.req.param('slug');
  try {
    const db = getTenantDb(c.env, slug);
    const bucket = getTenantBucket(c.env, slug);
    const body = await c.req.arrayBuffer();
    const contentType = c.req.header('Content-Type') ?? 'image/png';
    const key = `settings/logo.${contentType.split('/')[1] ?? 'png'}`;
    await bucket.put(key, body, { httpMetadata: { contentType } });
    const logo_url = `/api/content/${slug}/settings/logo`;
    await db.prepare('UPDATE tenant_settings SET logo_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(logo_url, 'singleton').run();
    return c.json(ok({ logo_url }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant not found or bucket unavailable'), 403);
  }
});

// Public: serve logo directly from R2
settingsRouter.get('/:slug/settings/logo', async (c) => {
  const slug = c.req.param('slug');
  try {
    const bucket = getTenantBucket(c.env, slug);
    for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'svg']) {
      const obj = await bucket.get(`settings/logo.${ext}`);
      if (obj) {
        return new Response(obj.body, {
          headers: { 'Content-Type': obj.httpMetadata?.contentType ?? `image/${ext}`, 'Cache-Control': 'public, max-age=3600' },
        });
      }
    }
    return new Response('Not found', { status: 404 });
  } catch {
    return new Response('Not found', { status: 404 });
  }
});

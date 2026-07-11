import { Hono } from 'hono';
import { editionsRouter } from './editions';
import { uploadRouter } from './upload';
import { internalRouter } from './internal';
import { statsRouter } from './stats';
import { plansRouter } from './plans';
import { readerRouter } from './reader';
import { settingsRouter } from './settings';
import { err, ErrorCode, ok } from '@epaper/types';
import { Env, orgUserAuth } from './middleware';
import { getTenantDb, getTenantBucket } from './db';

const app = new Hono<{ Bindings: Env }>();

app.use('*', async (c, next) => {
  const match = c.req.path.match(/^\/api\/(?:content|read)\/([^\/]+)/);
  if (match) {
    const slug = match[1];
    try {
      const tenant = await c.env.CONTROL_DB.prepare('SELECT status FROM tenants WHERE slug = ?').bind(slug).first<{ status: string }>();
      if (tenant?.status === 'suspended') {
        return c.json(err(ErrorCode.FORBIDDEN, 'TENANT_SUSPENDED'), 403);
      }
      if (tenant?.status === 'deleting' || tenant?.status === 'deleted') {
        return c.json(err(ErrorCode.NOT_FOUND, 'TENANT_DELETED'), 404);
      }
    } catch (e) {
      // If DB error, fail open or log? We'll log and continue.
      console.error('Failed to check tenant status', e);
    }
  }
  await next();
});

// ── Internal provisioning callbacks (no auth) ─────────────────────────────
app.route('/', internalRouter);

// ── Public reader-facing API ──────────────────────────────────────────────
// No staff auth required: signup/login/catalog/page-serving are all public.
// Individual pages check subscription status internally.
app.route('/api/read', readerRouter);

// ── Public content endpoints (must be registered BEFORE orgUserAuth) ──────

// Branding / settings — reader app fetches this to get logo + theme + org name
app.get('/api/content/:slug/settings', async (c) => {
  const slug = c.req.param('slug');
  try {
    const db = getTenantDb(c.env, slug);
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS tenant_settings (
        id TEXT PRIMARY KEY DEFAULT 'singleton',
        org_name TEXT,
        logo_url TEXT,
        favicon_url TEXT,
        theme_id TEXT NOT NULL DEFAULT 'modern',
        footer_links TEXT,
        social_links TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run().catch(() => {});
    await db.prepare('ALTER TABLE tenant_settings ADD COLUMN footer_links TEXT DEFAULT null').run().catch(() => {});
    await db.prepare('ALTER TABLE tenant_settings ADD COLUMN social_links TEXT DEFAULT null').run().catch(() => {});
    await db.prepare('ALTER TABLE tenant_settings ADD COLUMN favicon_url TEXT DEFAULT null').run().catch(() => {});

    const row = await db.prepare('SELECT * FROM tenant_settings WHERE id = ?').bind('singleton').first();
    return c.json(ok(row ?? { id: 'singleton', org_name: null, logo_url: null, favicon_url: null, theme_id: 'modern', footer_links: null, social_links: null }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant not found'), 403);
  }
});

// Logo image served from R2 — public, no auth
app.get('/api/content/:slug/settings/logo', async (c) => {
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

// ── Staff (tenant) API — requires a valid org-user JWT ───────────────────
app.use('/api/content/*', orgUserAuth);
app.route('/api/content', editionsRouter);
app.route('/api/content', uploadRouter);
app.route('/api/content', statsRouter);
app.route('/api/content', plansRouter);
app.route('/api/content', settingsRouter);   // PATCH + PUT (logo upload) are staff-only

app.get('/health', (c) => c.json(ok({ status: 'ok', worker: 'content' })));

app.notFound((c) => {
  return c.json(err(ErrorCode.NOT_FOUND, 'Not found'), 404);
});

export default {
  fetch: app.fetch,
  scheduled: async (event: any, env: Env, ctx: any) => {
    ctx.waitUntil((async () => {
      try {
        const tenants = await env.CONTROL_DB.prepare("SELECT slug FROM tenants WHERE status = 'active'").all<{ slug: string }>();
        for (const t of tenants.results || []) {
          try {
            const db = getTenantDb(env, t.slug);
            await db.prepare("UPDATE epapers SET status = 'published' WHERE status = 'draft' AND publish_type = 'scheduled' AND scheduled_at <= datetime('now')").run();
          } catch (e) {
            console.error(`Failed to run scheduled publish for ${t.slug}`, e);
          }
        }
      } catch (e) {
        console.error('Failed to run scheduled job', e);
      }
    })());
  }
};

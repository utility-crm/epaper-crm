import { Hono } from 'hono';
import { getTenantDb, getTenantBucket } from './db';
import { ok, err, ErrorCode } from '@epaper/types';

export const settingsRouter = new Hono<{ Bindings: Record<string, unknown>; Variables: { userId: string } }>();

// Public endpoint — used by reader app for branding
settingsRouter.get('/:slug/settings', async (c) => {
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
    await db.prepare('ALTER TABLE tenant_settings ADD COLUMN reader_auth_otp_enabled INTEGER NOT NULL DEFAULT 0').run().catch(() => {});
    await db.prepare('ALTER TABLE tenant_settings ADD COLUMN reader_auth_email_enabled INTEGER NOT NULL DEFAULT 1').run().catch(() => {});
    await db.prepare('ALTER TABLE tenant_settings ADD COLUMN reader_auth_otp_only INTEGER NOT NULL DEFAULT 0').run().catch(() => {});

    const row = await db.prepare('SELECT * FROM tenant_settings WHERE id = ?').bind('singleton').first();
    return c.json(ok(row ?? { id: 'singleton', org_name: null, logo_url: null, favicon_url: null, theme_id: 'modern', footer_links: null, social_links: null, reader_auth_otp_enabled: 0, reader_auth_email_enabled: 1, reader_auth_otp_only: 0 }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant not found'), 403);
  }
});

// Staff-only: update branding & footer settings
settingsRouter.patch('/:slug/settings', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();
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
    await db.prepare('ALTER TABLE tenant_settings ADD COLUMN reader_auth_otp_enabled INTEGER NOT NULL DEFAULT 0').run().catch(() => {});
    await db.prepare('ALTER TABLE tenant_settings ADD COLUMN reader_auth_email_enabled INTEGER NOT NULL DEFAULT 1').run().catch(() => {});
    await db.prepare('ALTER TABLE tenant_settings ADD COLUMN reader_auth_otp_only INTEGER NOT NULL DEFAULT 0').run().catch(() => {});

    await db.prepare("INSERT OR IGNORE INTO tenant_settings (id, theme_id) VALUES ('singleton', 'modern')").run();

    const footerLinksVal = body.footer_links !== undefined ? (typeof body.footer_links === 'string' ? body.footer_links : JSON.stringify(body.footer_links)) : null;
    const socialLinksVal = body.social_links !== undefined ? (typeof body.social_links === 'string' ? body.social_links : JSON.stringify(body.social_links)) : null;

    // Reader-auth flags: accept only 0/1 when present, else leave unchanged (null -> COALESCE).
    const toBit = (v: unknown): number | null => (v === undefined || v === null) ? null : (v ? 1 : 0);
    const otpEnabled = toBit(body.reader_auth_otp_enabled);
    const emailEnabled = toBit(body.reader_auth_email_enabled);
    const otpOnly = toBit(body.reader_auth_otp_only);

    await db.prepare(
      'UPDATE tenant_settings SET org_name = COALESCE(?, org_name), theme_id = COALESCE(?, theme_id), footer_links = COALESCE(?, footer_links), social_links = COALESCE(?, social_links), favicon_url = COALESCE(?, favicon_url), reader_auth_otp_enabled = COALESCE(?, reader_auth_otp_enabled), reader_auth_email_enabled = COALESCE(?, reader_auth_email_enabled), reader_auth_otp_only = COALESCE(?, reader_auth_otp_only), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(body.org_name ?? null, body.theme_id ?? null, footerLinksVal, socialLinksVal, body.favicon_url ?? null, otpEnabled, emailEnabled, otpOnly, 'singleton').run();
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

// Staff-only: upload favicon to R2 and store URL
settingsRouter.put('/:slug/settings/favicon', async (c) => {
  const slug = c.req.param('slug');
  try {
    const db = getTenantDb(c.env, slug);
    const bucket = getTenantBucket(c.env, slug);
    const body = await c.req.arrayBuffer();
    const contentType = c.req.header('Content-Type') ?? 'image/x-icon';
    const ext = contentType.includes('png') ? 'png' : contentType.includes('svg') ? 'svg' : 'ico';
    const key = `settings/favicon.${ext}`;
    await bucket.put(key, body, { httpMetadata: { contentType } });
    const favicon_url = `/api/content/${slug}/settings/favicon`;
    try {
      await db.prepare('ALTER TABLE tenant_settings ADD COLUMN favicon_url TEXT DEFAULT null').run();
    } catch (_) {}
    await db.prepare('UPDATE tenant_settings SET favicon_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(favicon_url, 'singleton').run();
    return c.json(ok({ favicon_url }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant not found or bucket unavailable'), 403);
  }
});

// Public: serve favicon directly from R2
settingsRouter.get('/:slug/settings/favicon', async (c) => {
  const slug = c.req.param('slug');
  try {
    const bucket = getTenantBucket(c.env, slug);
    for (const ext of ['ico', 'png', 'svg', 'jpg', 'webp']) {
      const obj = await bucket.get(`settings/favicon.${ext}`);
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

// Staff-only: Delete organization
settingsRouter.delete('/:slug/settings', async (c) => {
  const slug = c.req.param('slug');
  try {
    const db = getTenantDb(c.env, slug);
    
    // 1. Cancel reader subscriptions immediately
    await db.prepare("UPDATE reader_subscriptions SET status = 'cancelled' WHERE status = 'active'").run();

    // 2. Cancel the platform subscription using internal billing API
    if ((c.env as any).BILLING_PLATFORM_WORKER) {
      const billingRes = await (c.env as any).BILLING_PLATFORM_WORKER.fetch(
        new Request(`http://billing/internal/billing/platform/${slug}/subscription`, { method: 'DELETE' })
      );
      if (!billingRes.ok) console.error('Failed to cancel platform subscription:', await billingRes.text());
    }

    // 3. Trigger the actual resource destruction via admin internal API
    if ((c.env as any).ADMIN_WORKER) {
      const adminRes = await (c.env as any).ADMIN_WORKER.fetch(
        new Request(`http://admin/api/tenants/internal/${slug}/deprovision`, { method: 'DELETE' })
      );
      if (!adminRes.ok) {
        console.error('Failed to trigger deprovision:', await adminRes.text());
        return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to trigger deletion'), 500);
      }
    } else {
      return c.json(err(ErrorCode.INTERNAL_ERROR, 'Admin worker binding missing'), 500);
    }

    return c.json(ok({ deleted: true }));
  } catch (e) {
    console.error(e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Deletion failed'), 500);
  }
});

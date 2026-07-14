import { Hono } from 'hono';
import { ok, err, ErrorCode, OrgUserRow } from '@epaper/types';
import { getTenantDb } from './db';
import { verifyPassword } from './password';

export const internalRouter = new Hono<{ Bindings: Record<string, unknown> }>();

// Internal endpoint for admin worker to verify org user credentials after provisioning
internalRouter.post('/internal/:slug/verify-owner', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json<{ email: string; password: string }>();
  
  try {
    const db = getTenantDb(c.env, slug);
    const user = await db.prepare(
      'SELECT id, email, password_hash, name, role FROM org_users WHERE email = ?'
    ).bind(body.email).first<Pick<OrgUserRow, 'id' | 'email' | 'password_hash' | 'name' | 'role'>>();
    
    if (!user) {
      return c.json(ok({ valid: false, role: null, userId: null }));
    }
    
    const valid = await verifyPassword(body.password, user.password_hash);
    return c.json(ok({ valid, role: valid ? user.role : null, userId: valid ? user.id : null }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not available'), 403);
  }
});

internalRouter.post('/internal/:slug/verify-firebase-owner', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json<{ claims: any }>();
  const claims = body.claims;
  if (!claims) return c.json(ok({ valid: false, role: null, userId: null }));

  const uid = claims.sub;
  const email = claims.email || null;
  const phone = claims.phone_number || null;
  const provider = claims.firebase?.sign_in_provider || 'unknown';

  try {
    const db = getTenantDb(c.env, slug);
    const user = await db.prepare(
      'SELECT id, email, role FROM org_users WHERE firebase_uid = ? OR (email IS NOT NULL AND email = ?) OR (phone_number IS NOT NULL AND phone_number = ?)'
    ).bind(uid, email || '', phone || '').first<{ id: string; email: string | null; role: string }>();

    if (!user) {
      return c.json(ok({ valid: false, role: null, userId: null }));
    }

    await db.prepare(
      'UPDATE org_users SET firebase_uid = ?, email_verified = ?, auth_provider = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(uid, claims.email_verified ? 1 : 0, provider, user.id).run();

    return c.json(ok({ valid: true, role: user.role, userId: user.id }));
  } catch {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not available'), 403);
  }
});

// Internal endpoint to migrate a pending owner into the org_users table upon tenant activation
internalRouter.post('/internal/:slug/migrate-owner', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json<{ id: string; email: string; name: string; password_hash: string; role: string }>();
  
  try {
    const db = getTenantDb(c.env, slug);
    await db.prepare(
      'INSERT INTO org_users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
    ).bind(body.id, body.email, body.password_hash, body.name, body.role).run();
    
    return c.json(ok({ migrated: true }));
  } catch (e) {
    console.error(`Error migrating owner for ${slug}:`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to migrate owner'), 500);
  }
});

import { Hono } from 'hono';
import { ok, err, ErrorCode } from '@epaper/types';
import { getTenantDb } from './db';

export const internalRouter = new Hono<{ Bindings: Record<string, unknown> }>();

// Note: org-user credential verification (verify-owner / verify-firebase-owner) moved to
// the epaper-auth worker, which reads org_users via its own per-tenant {SLUG}_DB bindings.

// Internal endpoint to migrate a pending owner into the org_users table upon tenant activation
internalRouter.post('/internal/:slug/migrate-owner', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json<{ id: string; email: string; name: string; password_hash: string; role: string }>();
  
  try {
    const db = getTenantDb(c.env, slug);
    await db.prepare(
      'INSERT OR REPLACE INTO org_users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)'
    ).bind(body.id, body.email, body.password_hash, body.name, body.role).run();
    
    return c.json(ok({ migrated: true }));
  } catch (e) {
    console.error(`Error migrating owner for ${slug}:`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to migrate owner'), 500);
  }
});

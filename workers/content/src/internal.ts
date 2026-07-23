import { Hono } from 'hono';
import { ok, err, ErrorCode } from '@epaper/types';
import { getTenantDb } from './db';

export const internalRouter = new Hono<{ Bindings: Record<string, unknown> }>();

// Note: org-user credential verification (verify-owner / verify-firebase-owner) moved to
// the epaper-auth worker, which reads org_users via its own per-tenant {SLUG}_DB bindings.

// Internal endpoint to migrate a pending owner into the org_users table upon tenant activation
internalRouter.post('/internal/:slug/migrate-owner', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json<{
    id: string; email: string | null; name: string; password_hash: string | null; role: string;
    firebase_uid?: string | null; phone_number?: string | null; email_verified?: number; auth_provider?: string;
  }>();

  try {
    const db = getTenantDb(c.env, slug);
    // Carry the Firebase identity onto the org_users row too. Without these columns a
    // Google/phone owner has no way to be resolved after activation (org-login/verify-org
    // match on firebase_uid/phone_number), and email_verified would silently reset to 0.
    // INSERT OR REPLACE deletes+reinserts on conflict, which would reset created_at
    // (and any other column defaulted here) to a fresh value on a retry. Use an upsert
    // that updates the identity columns in place and leaves created_at untouched, so
    // re-running migrate-owner stays idempotent.
    await db.prepare(
      `INSERT INTO org_users (id, email, password_hash, name, role, firebase_uid, phone_number, email_verified, auth_provider)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         email = excluded.email,
         password_hash = excluded.password_hash,
         name = excluded.name,
         role = excluded.role,
         firebase_uid = excluded.firebase_uid,
         phone_number = excluded.phone_number,
         email_verified = excluded.email_verified,
         auth_provider = excluded.auth_provider`
    ).bind(
      body.id, body.email, body.password_hash, body.name, body.role,
      body.firebase_uid ?? null, body.phone_number ?? null, body.email_verified ?? 0, body.auth_provider ?? 'local'
    ).run();

    return c.json(ok({ migrated: true }));
  } catch (e) {
    console.error(`Error migrating owner for ${slug}:`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to migrate owner'), 500);
  }
});

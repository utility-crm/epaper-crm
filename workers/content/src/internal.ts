import { Hono, MiddlewareHandler } from 'hono';
import { ok, err, ErrorCode } from '@epaper/types';
import { getTenantDb } from './db';

export const internalRouter = new Hono<{ Bindings: Record<string, unknown> }>();

/** Length-independent equality. Avoids leaking the secret's prefix through timing. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Shared-secret gate for internal routes.
 *
 * A service binding is not itself an authenticator: this worker's wrangler.jsonc sets no
 * `routes` and does not disable `workers_dev`, so it also answers on its workers.dev
 * hostname. /internal/* escapes the gateway (which only forwards /api/*) but not the public
 * internet, and the routes below take a tenant slug and an email straight from the caller.
 * Ungated, set-email-verified lets anyone clear the content write gate for any address.
 *
 * Fails CLOSED when INTERNAL_SECRET is unset — an unconfigured deploy must not silently
 * serve these unauthenticated, which is the state this guard exists to end.
 */
const internalAuth: MiddlewareHandler<{ Bindings: Record<string, unknown> }> = async (c, next) => {
  const expected = c.env.INTERNAL_SECRET;
  if (typeof expected !== 'string' || expected.length === 0) {
    console.error('[content] INTERNAL_SECRET is not configured; refusing internal request');
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Internal auth not configured'), 503);
  }
  const provided = c.req.header('X-Internal-Secret');
  if (!provided || !secretsMatch(provided, expected)) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid internal secret'), 401);
  }
  await next();
};

// Note: org-user credential verification (verify-owner / verify-firebase-owner) moved to
// the epaper-auth worker, which reads org_users via its own per-tenant {SLUG}_DB bindings.

// Internal endpoint to migrate a pending owner into the org_users table upon tenant activation
internalRouter.post('/internal/:slug/migrate-owner', internalAuth, async (c) => {
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

/**
 * Read the owner's verification flag from an active tenant's org_users. Same reason as
 * the setter below: the admin worker has no per-tenant D1 binding.
 *
 * `found: false` (not a 404) when there is no row for the address — the caller falls back
 * to pending_owners, which is a normal state, not an error.
 */
internalRouter.get('/internal/:slug/email-verification', internalAuth, async (c) => {
  const slug = c.req.param('slug');
  const email = c.req.query('email');
  if (!email) return c.json(err(ErrorCode.BAD_REQUEST, 'Email required'), 400);

  try {
    const row = await getTenantDb(c.env, slug).prepare(
      'SELECT email, email_verified FROM org_users WHERE LOWER(email) = ?'
    ).bind(email.toLowerCase()).first<{ email: string | null; email_verified: number }>();
    if (!row) return c.json(ok({ found: false }));
    return c.json(ok({ found: true, verified: !!row.email_verified }));
  } catch (e) {
    console.error(`Error reading email_verified for ${slug}:`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to read verification flag'), 500);
  }
});

/**
 * Flip email_verified on an active tenant's org_users row. Called only by the admin
 * worker's superadmin manual-verify endpoint — the admin worker holds CONTROL_DB and
 * service bindings but no per-tenant D1, so the write has to happen here.
 *
 * Reports `changes` rather than 404-ing on a miss: the caller cannot tell in advance
 * whether the owner row lives here or still in pending_owners (activation does not
 * reliably migrate it — see verify-email.ts readOwner), so it needs to try both and
 * decide from the counts.
 */
internalRouter.post('/internal/:slug/set-email-verified', internalAuth, async (c) => {
  const slug = c.req.param('slug');
  const { email } = await c.req.json<{ email?: string }>().catch(() => ({ email: undefined }));
  if (!email || typeof email !== 'string') {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Email required'), 400);
  }

  try {
    // LOWER() on both sides, matching verify-email.ts: rows predating the
    // lowercase-on-write rule are stored mixed-case and an exact match misses them.
    const res = await getTenantDb(c.env, slug).prepare(
      'UPDATE org_users SET email_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = ?'
    ).bind(email.toLowerCase()).run();
    return c.json(ok({ changes: res.meta.changes }));
  } catch (e) {
    console.error(`Error setting email_verified for ${slug}:`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to update verification flag'), 500);
  }
});

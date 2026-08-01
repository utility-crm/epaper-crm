import { Context, Next, MiddlewareHandler } from 'hono';
import { err, ErrorCode, OrgUserRole } from '@epaper/types';
import { verifyJwt } from './jwt';
import { getTenantDb } from './db';

export interface Env {
  CONTROL_DB: D1Database;
  ORG_JWT_SECRET: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
  [key: string]: unknown;
}

export async function orgUserAuth(c: Context<{ Bindings: Env; Variables: { tenantId: string; tenantSlug: string; orgRole: OrgUserRole; userId: string } }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Missing or invalid token'), 401);
  }
  const token = authHeader.substring(7);
  const payload = await verifyJwt(token, c.env.ORG_JWT_SECRET);
  
  if (!payload || payload.aud !== 'tenant-portal' || typeof payload.sub !== 'string' || typeof payload.tenantSlug !== 'string' || typeof payload.role !== 'string' || typeof payload.userId !== 'string') {
    return c.json(err(ErrorCode.INVALID_AUDIENCE, 'Invalid tenant token'), 403);
  }
  
  // The route slug decides which tenant D1/R2 every handler below opens (getTenantDb(slug)),
  // and nothing downstream compares it to the token. Without this check a publisher holding
  // a valid JWT for tenant A could read, write and upload into tenant B simply by changing
  // the slug in the URL. Checked here rather than per-route so the whole staff surface is
  // covered by one guard; the path is matched instead of c.req.param because middleware
  // mounted on a wildcard sees no route params.
  const routeSlug = c.req.path.match(/^\/api\/content\/([^\/]+)/)?.[1];
  if (routeSlug && decodeURIComponent(routeSlug) !== payload.tenantSlug) {
    return c.json(err(ErrorCode.FORBIDDEN, 'Token does not belong to this publication'), 403);
  }

  c.set('tenantId', payload.sub);
  c.set('tenantSlug', payload.tenantSlug);
  c.set('orgRole', payload.role as OrgUserRole);
  c.set('userId', payload.userId);
  await next();
};

type OrgUserFlags = { email: string | null; email_verified: number };

const readOrgUser = (db: D1Database, userId: string) =>
  db.prepare('SELECT email, email_verified FROM org_users WHERE id = ?')
    .bind(userId).first<OrgUserFlags>();

/**
 * Legacy backfill for tenants whose owner row was never migrated into the tenant DB by
 * provision (see internal.ts, which is the real path).
 *
 * Lives here, ahead of the gate, rather than inside the POST /:slug/editions handler where
 * it used to sit. The gate needs an org_users row to read, and this is the only code that
 * creates a missing one — behind the gate it was unreachable exactly when it was needed, so
 * a tenant with no row could never acquire one. editions was also just one of the six
 * guarded routes; the other five never repaired anything.
 *
 * Every INSERT carries email_verified explicitly: the column defaults to 0 and the gate
 * reads it on every write, so a row written without it locks the owner out permanently in
 * the synthetic-address branch, where no verification mail can ever arrive.
 *
 * pending_owners is authoritative when we find it. Without it, the address on the tenant row
 * is still a real deliverable one that nobody has confirmed, so it is written unverified —
 * the owner is blocked on their next write and Resend gets them out. Only the synthetic
 * @tenant.local fallback is written verified, because no mail can ever reach it and the gate
 * would otherwise block that account with no way to recover.
 *
 * Errors are not swallowed: the caller turns them into a 503, which is honest, where the old
 * swallow let the edition INSERT proceed to fail on its created_by foreign key instead.
 */
async function ensureOrgUser(db: D1Database, controlDb: D1Database | undefined, slug: string, userId: string) {
  const INSERT =
    'INSERT OR IGNORE INTO org_users (id, email, password_hash, name, role, email_verified) VALUES (?, ?, ?, ?, ?, ?)';
  const tenant = controlDb
    ? await controlDb.prepare('SELECT id, email FROM tenants WHERE slug = ?').bind(slug).first<{ id: string; email: string }>()
    : null;

  if (!tenant) {
    await db.prepare(INSERT).bind(userId, `${userId}@tenant.local`, '', 'Admin', 'owner', 1).run();
    return;
  }
  const owner = await controlDb!
    .prepare('SELECT * FROM pending_owners WHERE id = ? OR tenant_id = ?')
    .bind(userId, tenant.id).first<any>();
  await db.prepare(INSERT).bind(
    userId, tenant.email, owner?.password_hash || '', owner?.name || 'Admin', owner?.role || 'owner',
    owner?.email_verified ? 1 : 0,
  ).run();
}

/**
 * Refuse content *writes* from a publisher whose email address is still unverified.
 *
 * Applied per-route (edition create, epaper create, the four upload routes) rather than at
 * the /api/content/* mount: mounted there it would also block reads, stats and settings,
 * so an unverified publisher would meet an empty broken portal instead of one telling them
 * to verify — and the verify button itself lives in that portal.
 *
 * The flag is read from org_users on every request, not from a JWT claim. Tokens live 7
 * days, so a claim would keep a just-verified publisher blocked until expiry, and would
 * keep granting access to anyone holding a token minted before the gate existed.
 *
 * Fails CLOSED, with a 503, when the flag cannot be read at all — a missing tenant binding,
 * a D1 error, or a row still absent after the backfill above. That costs nothing the caller
 * had: all six guarded handlers open the same tenant D1 themselves and throw when it is
 * unreachable, so a request the gate turns away here was already going to fail downstream.
 * 503 rather than 403 because the condition is transient and unrelated to the publisher —
 * it says "retry", not "you are unverified".
 *
 * A phone-only account (email IS NULL) has nothing to verify and passes.
 */
// Declared as MiddlewareHandler, not (c: Context<...>, next): as a plain function it is
// opaque to Hono's route inference, and every c.req.param('slug') on a guarded route
// degrades to string | undefined.
export const requireVerifiedEmail: MiddlewareHandler<{
  Bindings: Env;
  Variables: { tenantSlug: string; userId: string };
}> = async (c, next) => {
  let row: OrgUserFlags | null;
  try {
    const db = getTenantDb(c.env, c.var.tenantSlug);
    row = await readOrgUser(db, c.var.userId);
    if (!row && c.var.userId) {
      await ensureOrgUser(db, c.env.CONTROL_DB, c.var.tenantSlug, c.var.userId);
      row = await readOrgUser(db, c.var.userId);
    }
  } catch (e) {
    console.error(`[content] verification gate failed for ${c.var.tenantSlug}:`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'VERIFICATION_UNAVAILABLE'), 503);
  }
  if (!row) {
    console.error(`[content] no org_users row for ${c.var.userId} in ${c.var.tenantSlug} after backfill`);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'VERIFICATION_UNAVAILABLE'), 503);
  }
  if (row.email && !row.email_verified) {
    return c.json(err(ErrorCode.FORBIDDEN, 'EMAIL_NOT_VERIFIED'), 403);
  }
  await next();
};

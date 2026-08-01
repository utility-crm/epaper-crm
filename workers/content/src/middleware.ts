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
 * Fails OPEN on a missing row, an absent tenant binding (still provisioning), or any D1
 * error. This is an anti-spam gate, not an authorisation boundary — orgUserAuth already
 * proved identity — and failing closed on a transient blip would stop verified publishers
 * from publishing. Fails closed only on a row that has an address with email_verified = 0;
 * a phone-only account (email IS NULL) has nothing to verify and is allowed through.
 */
// Declared as MiddlewareHandler, not (c: Context<...>, next): as a plain function it is
// opaque to Hono's route inference, and every c.req.param('slug') on a guarded route
// degrades to string | undefined.
export const requireVerifiedEmail: MiddlewareHandler<{
  Bindings: Env;
  Variables: { tenantSlug: string; userId: string };
}> = async (c, next) => {
  try {
    const db = getTenantDb(c.env, c.var.tenantSlug);
    const row = await db.prepare('SELECT email, email_verified FROM org_users WHERE id = ?')
      .bind(c.var.userId).first<{ email: string | null; email_verified: number }>();
    if (row?.email && !row.email_verified) {
      return c.json(err(ErrorCode.FORBIDDEN, 'EMAIL_NOT_VERIFIED'), 403);
    }
  } catch (e) {
    console.error(`[content] verification gate lookup failed for ${c.var.tenantSlug}, allowing:`, e);
  }
  await next();
};

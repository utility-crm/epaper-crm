import { Context, Next } from 'hono';
import { err, ErrorCode, AdminRole, OrgUserRole } from '@epaper/types';
import { verifyJwt } from './jwt';

export interface Env {
  // Control plane DB (epaper-control): admins, tenants, pending_owners, audit_log.
  CONTROL_DB: D1Database;
  // Session-signing secrets (shared with admin/content/billing via `wrangler secret put`).
  ADMIN_JWT_SECRET: string;
  ORG_JWT_SECRET: string;
  // Firebase project for ID-token verification (RS256 against Google JWKS).
  FIREBASE_PROJECT_ID?: string;
  // Auth mail (see packages/auth-mail): Resend key is a secret; the sending subdomain
  // and link base are plain vars so a compromised domain can be rotated without a rebuild.
  RESEND_API_KEY?: string;
  AUTH_MAIL_DOMAIN?: string;
  AUTH_LINK_BASE?: string;
  // Fired only by /signup to kick off tenant provisioning.
  PROVISION_WORKER: Fetcher;
  // Per-tenant {SLUG}_DB bindings are injected dynamically at provision time; read via getTenantDb.
  [key: string]: unknown;
}

export async function adminAuth(c: Context<{ Bindings: Env; Variables: { adminId: string; adminRole: AdminRole } }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Missing or invalid token'), 401);
  }
  const token = authHeader.substring(7);
  const payload = await verifyJwt(token, c.env.ADMIN_JWT_SECRET);

  if (!payload || payload.aud !== 'crm' || typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
    return c.json(err(ErrorCode.INVALID_AUDIENCE, 'Invalid admin token'), 403);
  }

  c.set('adminId', payload.sub);
  c.set('adminRole', payload.role as AdminRole);
  await next();
}

// ABAC: org_users.permissions is JSON TEXT. A malformed value must not 500 a login,
// so parse defensively and treat anything that isn't a non-empty string array as "no
// explicit grant" (undefined), which falls back to role in can()/may(). An empty array
// is "unconfigured", not "denied everything" — nothing writes that column yet, and
// reading it as a deny-all would lock an owner out of their own portal.
export function parsePermissions(raw: unknown): string[] | undefined {
  if (typeof raw !== 'string') return undefined;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) && v.length && v.every((s) => typeof s === 'string') ? v : undefined;
  } catch {
    return undefined;
  }
}

// Read a user's ABAC grants at mint time. Separate query rather than widening the
// login SELECTs: org_users.permissions arrives with migrations/tenant/0013, and a
// tenant DB that hasn't been migrated yet must still be able to log in (role fallback).
export async function loadPermissions(db: D1Database, userId: string): Promise<string[] | undefined> {
  try {
    const r = await db.prepare('SELECT permissions FROM org_users WHERE id = ?')
      .bind(userId).first<{ permissions: string | null }>();
    return parsePermissions(r?.permissions);
  } catch (e) {
    // Only an unmigrated tenant DB (0013 not applied) may fall back to role. A transient
    // D1 failure must not silently widen a narrowing grant into a 7-day owner/admin token.
    const m = e instanceof Error ? e.message : String(e);
    if (/no such column/i.test(m)) return undefined;
    console.error('loadPermissions failed', { userId, error: m });
    throw e;
  }
}

/**
 * Permission check for tenant-portal callers. An explicit permissions array on the
 * user is authoritative; without one we fall back to role. Same rule as mayGrant()
 * in workers/billing-tenant/src/admin-grants.ts.
 */
export function can(c: Context<{ Variables: { orgRole?: OrgUserRole; permissions?: string[] } }>, perm: string): boolean {
  const perms = c.var.permissions;
  if (perms?.length) return perms.includes(perm);
  return c.var.orgRole === 'owner' || c.var.orgRole === 'admin';
}

export async function orgUserAuth(c: Context<{ Bindings: Env; Variables: { tenantId: string; tenantSlug: string; orgRole: OrgUserRole; userId: string; permissions?: string[] } }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Missing or invalid token'), 401);
  }
  const token = authHeader.substring(7);
  const payload = await verifyJwt(token, c.env.ORG_JWT_SECRET);

  if (!payload || payload.aud !== 'tenant-portal' || typeof payload.sub !== 'string' || typeof payload.tenantSlug !== 'string' || typeof payload.role !== 'string' || typeof payload.userId !== 'string') {
    return c.json(err(ErrorCode.INVALID_AUDIENCE, 'Invalid tenant token'), 403);
  }

  c.set('tenantId', payload.sub);
  c.set('tenantSlug', payload.tenantSlug);
  c.set('orgRole', payload.role as OrgUserRole);
  c.set('userId', payload.userId);
  // Left unset when the claim is absent so can() falls back to role — tokens minted
  // before ABAC existed must keep working until they expire. Same shape rule as
  // parsePermissions: a non-empty array of strings, or no explicit grant at all.
  if (Array.isArray(payload.permissions) && payload.permissions.length
      && payload.permissions.every((s) => typeof s === 'string')) {
    c.set('permissions', payload.permissions as string[]);
  }
  await next();
}

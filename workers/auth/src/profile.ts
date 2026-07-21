import { Hono, Context } from 'hono';
import { Env, orgUserAuth } from './middleware';
import { ok, err, ErrorCode, OrgUserRole } from '@epaper/types';
import { verifyFirebaseToken } from './verifyFirebaseToken';
import { getTenantDb } from './db';

type ProfileVars = { tenantId: string; tenantSlug: string; orgRole: OrgUserRole; userId: string };
type ProfileCtx = Context<{ Bindings: Env; Variables: ProfileVars }>;

// Publisher self-service profile. Guarded by orgUserAuth (tenant-portal JWT).
// The owner row lives in org_users (tenant DB) once active, or pending_owners
// (control DB) while the tenant is still provisioning.
export const profileRouter = new Hono<{ Bindings: Env; Variables: ProfileVars }>();

type OwnerContact = { email: string | null; phone_number: string | null; email_verified: number; auth_provider: string };

// Resolve where this owner's row lives. Active tenant -> org_users in its own D1;
// otherwise the pending_owners row in the control DB.
async function loadOwner(c: ProfileCtx): Promise<{ where: 'org_users' | 'pending_owners'; row: OwnerContact | null }> {
  const tenant = await c.env.CONTROL_DB.prepare('SELECT status FROM tenants WHERE id = ?')
    .bind(c.var.tenantId).first<{ status: string }>();

  if (tenant?.status === 'active') {
    const db = getTenantDb(c.env, c.var.tenantSlug);
    const row = await db.prepare('SELECT email, phone_number, email_verified, auth_provider FROM org_users WHERE id = ?')
      .bind(c.var.userId).first<OwnerContact>();
    return { where: 'org_users', row };
  }

  const row = await c.env.CONTROL_DB.prepare('SELECT phone_number, email_verified, auth_provider FROM pending_owners WHERE id = ?')
    .bind(c.var.userId).first<{ phone_number: string | null; email_verified: number; auth_provider: string }>();
  // pending_owners has no email column; the tenant email is the account key.
  const tenantEmail = await c.env.CONTROL_DB.prepare('SELECT email FROM tenants WHERE id = ?')
    .bind(c.var.tenantId).first<{ email: string | null }>();
  return { where: 'pending_owners', row: row ? { ...row, email: tenantEmail?.email ?? null } : null };
}

profileRouter.get('/profile', orgUserAuth, async (c) => {
  try {
    const { row } = await loadOwner(c);
    if (!row) return c.json(err(ErrorCode.NOT_FOUND, 'Profile not found'), 404);
    return c.json(ok({
      email: row.email,
      phone_number: row.phone_number,
      email_verified: !!row.email_verified,
      auth_provider: row.auth_provider,
    }));
  } catch (e) {
    console.error('profile load failed:', e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to load profile'), 500);
  }
});

// Add + verify a phone number on the authenticated publisher's own account, using a
// Firebase phone-auth ID token (proves the caller controls the number).
profileRouter.post('/add-phone', orgUserAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const idToken = body.idToken;
  if (!idToken) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing ID token'), 400);

  const claims = await verifyFirebaseToken(idToken, c.env.FIREBASE_PROJECT_ID || 'epaperspace');
  if (!claims) return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid Firebase token'), 401);

  const phone = claims.phone_number;
  if (!phone) return c.json(err(ErrorCode.BAD_REQUEST, 'Token has no verified phone number'), 400);
  const uid = claims.sub;

  try {
    const { where } = await loadOwner(c);

    if (where === 'org_users') {
      const db = getTenantDb(c.env, c.var.tenantSlug);
      // Reject if the number (or firebase_uid) is already on a DIFFERENT org_user.
      const clash = await db.prepare(
        'SELECT id FROM org_users WHERE (phone_number = ? OR firebase_uid = ?) AND id != ?'
      ).bind(phone, uid, c.var.userId).first();
      if (clash) return c.json(err(ErrorCode.CONFLICT, 'This phone number is already linked to another account.'), 409);

      await db.prepare(
        'UPDATE org_users SET phone_number = ?, firebase_uid = COALESCE(firebase_uid, ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(phone, uid, c.var.userId).run();
    } else {
      // Pending tenant: keep the phone on the pending_owners row so it survives migration.
      const clash = await c.env.CONTROL_DB.prepare(
        'SELECT id FROM pending_owners WHERE (phone_number = ? OR firebase_uid = ?) AND id != ?'
      ).bind(phone, uid, c.var.userId).first();
      if (clash) return c.json(err(ErrorCode.CONFLICT, 'This phone number is already linked to another account.'), 409);

      await c.env.CONTROL_DB.prepare(
        'UPDATE pending_owners SET phone_number = ?, firebase_uid = COALESCE(firebase_uid, ?) WHERE id = ?'
      ).bind(phone, uid, c.var.userId).run();
    }

    return c.json(ok({ phone_number: phone }));
  } catch (e) {
    console.error('add-phone failed:', e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to add phone number'), 500);
  }
});

import { Hono, Context } from 'hono';
import { Env, orgUserAuth } from './middleware';
import { ok, err, ErrorCode, OrgUserRole } from '@epaper/types';
import { verifyFirebaseToken } from './verifyFirebaseToken';
import { getTenantDb } from './db';
import { mailToken, TenantLite } from './verify-email';
import { allowSend } from '@epaper/auth-mail';

type ProfileVars = { tenantId: string; tenantSlug: string; orgRole: OrgUserRole; userId: string };
type ProfileCtx = Context<{ Bindings: Env; Variables: ProfileVars }>;

// Publisher self-service profile. Guarded by orgUserAuth (tenant-portal JWT).
// The owner row lives in org_users (tenant DB) once active, or pending_owners
// (control DB) while the tenant is still provisioning.
export const profileRouter = new Hono<{ Bindings: Env; Variables: ProfileVars }>();

type OwnerContact = { email: string | null; phone_number: string | null; email_verified: number; auth_provider: string };

// pending_owners has no email column; the tenant email is the account key.
async function loadPendingOwner(c: ProfileCtx): Promise<OwnerContact | null> {
  const row = await c.env.CONTROL_DB.prepare('SELECT phone_number, email_verified, auth_provider FROM pending_owners WHERE id = ?')
    .bind(c.var.userId).first<{ phone_number: string | null; email_verified: number; auth_provider: string }>();
  if (!row) return null;
  const tenantEmail = await c.env.CONTROL_DB.prepare('SELECT email FROM tenants WHERE id = ?')
    .bind(c.var.tenantId).first<{ email: string | null }>();
  return { ...row, email: tenantEmail?.email ?? null };
}

/**
 * Resolve where this owner's row lives. Active tenant -> org_users in its own D1;
 * otherwise the pending_owners row in the control DB.
 *
 * `status === 'active'` is a hint, not a guarantee. Two live tenants disagreed with it: one
 * was active with an empty org_users because activation never migrated the owner across, and
 * one was active with no D1 binding in any worker at all, so getTenantDb threw. Both made
 * this function report "no profile", which turned into a 404 on GET /profile — so the portal
 * showed no verification status and the resend button had nothing to act on. Fall back to
 * pending_owners in both cases instead of declaring the account gone.
 */
async function loadOwner(c: ProfileCtx): Promise<{ where: 'org_users' | 'pending_owners'; row: OwnerContact | null }> {
  const tenant = await c.env.CONTROL_DB.prepare('SELECT status FROM tenants WHERE id = ?')
    .bind(c.var.tenantId).first<{ status: string }>();

  if (tenant?.status === 'active') {
    try {
      const db = getTenantDb(c.env, c.var.tenantSlug);
      const row = await db.prepare('SELECT email, phone_number, email_verified, auth_provider FROM org_users WHERE id = ?')
        .bind(c.var.userId).first<OwnerContact>();
      // Only claim org_users when the row is actually there: `where` decides which table the
      // writers below UPDATE, and naming an empty table would drop the write silently.
      if (row) return { where: 'org_users', row };
    } catch (e) {
      console.error(`profile: tenant DB lookup failed for ${c.var.tenantSlug}:`, e);
    }
  }

  return { where: 'pending_owners', row: await loadPendingOwner(c) };
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

    // A single firebase_uid column can't represent two Firebase identities. If the
    // owner already has a uid (e.g. from Google) and this phone token carries a
    // DIFFERENT uid, the phone was verified as a separate Firebase user — storing it
    // would let verify-org resolve the row by phone yet reject the mismatched uid, so
    // the number could never actually log in. Only adopt the phone's uid when the row
    // has none yet, or when it already matches (proper client-side account linking).
    const conflictMsg = 'This phone number is already linked to another account.';
    const mismatchMsg = 'Please verify this phone using your existing sign-in, then try again.';

    if (where === 'org_users') {
      const db = getTenantDb(c.env, c.var.tenantSlug);
      const clash = await db.prepare(
        'SELECT id FROM org_users WHERE (phone_number = ? OR firebase_uid = ?) AND id != ?'
      ).bind(phone, uid, c.var.userId).first();
      if (clash) return c.json(err(ErrorCode.CONFLICT, conflictMsg), 409);

      const self = await db.prepare('SELECT firebase_uid FROM org_users WHERE id = ?')
        .bind(c.var.userId).first<{ firebase_uid: string | null }>();
      if (self?.firebase_uid && self.firebase_uid !== uid) {
        return c.json(err(ErrorCode.CONFLICT, mismatchMsg), 409);
      }

      await db.prepare(
        'UPDATE org_users SET phone_number = ?, firebase_uid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(phone, uid, c.var.userId).run();
    } else {
      // Pending tenant: keep the phone on the pending_owners row so it survives migration.
      const clash = await c.env.CONTROL_DB.prepare(
        'SELECT id FROM pending_owners WHERE (phone_number = ? OR firebase_uid = ?) AND id != ?'
      ).bind(phone, uid, c.var.userId).first();
      if (clash) return c.json(err(ErrorCode.CONFLICT, conflictMsg), 409);

      const self = await c.env.CONTROL_DB.prepare('SELECT firebase_uid FROM pending_owners WHERE id = ?')
        .bind(c.var.userId).first<{ firebase_uid: string | null }>();
      if (self?.firebase_uid && self.firebase_uid !== uid) {
        return c.json(err(ErrorCode.CONFLICT, mismatchMsg), 409);
      }

      const upd = await c.env.CONTROL_DB.prepare(
        'UPDATE pending_owners SET phone_number = ?, firebase_uid = ? WHERE id = ?'
      ).bind(phone, uid, c.var.userId).run();

      // Activation may have migrated the row into org_users between loadOwner and now.
      // If so this UPDATE hit 0 rows and would silently drop the phone; re-apply it to
      // the tenant DB. Only a genuine "row nowhere" case is a retryable conflict.
      // NOTE: skips a clash re-check in this race fallback (tiny window; the row
      // just migrated), add if phone-uniqueness races become a real concern.
      if (!upd.meta.changes) {
        let db: D1Database;
        try {
          db = getTenantDb(c.env, c.var.tenantSlug);
        } catch {
          // Tenant DB binding absent = still provisioning. Same retryable conflict.
          return c.json(err(ErrorCode.CONFLICT, 'Account is still provisioning, please retry.'), 409);
        }
        const moved = await db.prepare(
          'UPDATE org_users SET phone_number = ?, firebase_uid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(phone, uid, c.var.userId).run();
        if (!moved.meta.changes) {
          return c.json(err(ErrorCode.CONFLICT, 'Account is still provisioning, please retry.'), 409);
        }
      }
    }

    return c.json(ok({ phone_number: phone }));
  } catch (e) {
    console.error('add-phone failed:', e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to add phone number'), 500);
  }
});

function loadTenantLite(c: ProfileCtx) {
  return c.env.CONTROL_DB.prepare('SELECT id, slug, name, status FROM tenants WHERE id = ?')
    .bind(c.var.tenantId).first<TenantLite>();
}

// RFC-perfect validation is a rabbit hole and the real check is the mail arriving; this
// only rejects the shapes that would corrupt a From/To header or a DB row.
function normalizeEmail(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const e = v.trim().toLowerCase();
  if (e.length < 3 || e.length > 254) return null;
  if (!/^[^\s@,<>"]+@[^\s@,<>"]+\.[^\s@,<>"]+$/.test(e)) return null;
  return e;
}

/**
 * Resend the verification link to the signed-in publisher's own address.
 *
 * The unauthenticated /verify-email/send must answer generically whether or not the
 * address exists, which makes it useless from inside the portal — the publisher cannot
 * tell a sent mail from a swallowed error. This route knows exactly who is calling, so
 * it can say what happened without becoming an account-enumeration surface.
 */
profileRouter.post('/verify-email/resend', orgUserAuth, async (c) => {
  try {
    const { row } = await loadOwner(c);
    if (!row) return c.json(err(ErrorCode.NOT_FOUND, 'Profile not found'), 404);
    if (!row.email) return c.json(err(ErrorCode.BAD_REQUEST, 'No email address on this account. Add one first.'), 400);
    if (row.email_verified) return c.json(err(ErrorCode.CONFLICT, 'Email already verified'), 409);

    const tenant = await loadTenantLite(c);
    if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Account no longer exists'), 404);

    if (!allowSend(`verify:${row.email.toLowerCase()}`)) {
      return c.json(err(ErrorCode.RATE_LIMITED, 'Too many attempts. Please wait an hour and try again.'), 429);
    }

    await mailToken(c.env, tenant, row.email, 'verify_email');
    return c.json(ok({ sent: true, email: row.email }));
  } catch (e) {
    console.error('verify-email resend failed:', e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, "Couldn't send the email right now. Please try again."), 500);
  }
});

/**
 * Attach an email address to an account that has none — the Google/OTP signup case.
 *
 * The address is always stored UNVERIFIED, whatever the caller claims: nothing here
 * proves the publisher controls it, and the emailed link is what does. Changing an
 * address that is already verified is deliberately not supported (that needs
 * confirmation from the old address, which is a different flow).
 */
profileRouter.post('/add-email', orgUserAuth, async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (!email) return c.json(err(ErrorCode.BAD_REQUEST, 'Enter a valid email address'), 400);

  const clashMsg = 'This email is already linked to another account.';

  try {
    const { where, row } = await loadOwner(c);
    if (!row) return c.json(err(ErrorCode.NOT_FOUND, 'Profile not found'), 404);
    if (row.email && row.email.toLowerCase() !== email && row.email_verified) {
      return c.json(err(ErrorCode.CONFLICT, 'This account already has a verified email address.'), 409);
    }

    const tenant = await loadTenantLite(c);
    if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Account no longer exists'), 404);

    // tenants.email is the login lookup key for every account, so it is checked in both
    // branches — an address free in one tenant DB can still be taken at the platform level.
    const tenantClash = await c.env.CONTROL_DB.prepare(
      'SELECT id FROM tenants WHERE LOWER(email) = ? AND id != ?'
    ).bind(email, c.var.tenantId).first();
    if (tenantClash) return c.json(err(ErrorCode.CONFLICT, clashMsg), 409);

    if (where === 'org_users') {
      const db = getTenantDb(c.env, c.var.tenantSlug);
      // org_users.email is UNIQUE (migrations/tenant/0011); catching the clash here turns
      // a raw D1 constraint error into the same 409 /add-phone gives.
      const clash = await db.prepare('SELECT id FROM org_users WHERE LOWER(email) = ? AND id != ?')
        .bind(email, c.var.userId).first();
      if (clash) return c.json(err(ErrorCode.CONFLICT, clashMsg), 409);

      await db.prepare(
        'UPDATE org_users SET email = ?, email_verified = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(email, c.var.userId).run();
    } else {
      // pending_owners has no email column — the tenant row carries the address until
      // activation migrates it into org_users.
      await c.env.CONTROL_DB.prepare('UPDATE pending_owners SET email_verified = 0 WHERE id = ?')
        .bind(c.var.userId).run();
    }

    // Written in both branches: for a pending tenant this IS the address, and for an
    // active one it keeps the login key in step with the address the publisher just set.
    await c.env.CONTROL_DB.prepare('UPDATE tenants SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(email, c.var.tenantId).run();

    // The address is stored either way; a mail failure only costs the publisher a tap on
    // Resend, so it is reported rather than rolled back.
    let sent = false;
    try {
      await mailToken(c.env, { ...tenant, name: tenant.name }, email, 'verify_email');
      sent = true;
    } catch (e) {
      console.error('add-email verification send failed:', e);
    }

    return c.json(ok({ email, email_verified: false, sent }));
  } catch (e) {
    console.error('add-email failed:', e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to add email address'), 500);
  }
});

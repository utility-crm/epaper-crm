import { Hono } from 'hono';
import { Env, loadPermissions } from './middleware';
import { ok, err, ErrorCode, OrgUserJwtPayload, TenantRow, PendingOwnerRow, OrgUserRow } from '@epaper/types';
import { signJwt } from './jwt';
import { hashPassword, verifyPassword } from './password';
import { verifyFirebaseToken } from './verifyFirebaseToken';
import { getTenantDb } from './db';
import { sendSignupVerification } from './verify-email';

export const orgAuthRouter = new Hono<{ Bindings: Env; Variables: { tenantId: string; tenantSlug: string; orgRole: string } }>();

function slugify(text: string): string {
  return text.toString().toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

orgAuthRouter.post('/signup', async (c) => {
  const body = await c.req.json();
  const { orgName, name, email, password, idToken } = body;

  if (!orgName || !name) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Missing organisation or name'), 400);
  }

  // Signup always provisions the free tier. Paid plans are never trusted from the
  // client here — they're set only by billing's verify-payment after a confirmed
  // Razorpay charge. (Previously the client-supplied `plan` was persisted verbatim,
  // letting a caller provision a paid tier with no billing authorization.)
  const plan = 'community';

  let firebaseUid: string | null = null;
  let phoneNumber: string | null = null;
  let emailVerified = 0;
  let authProvider = 'password';
  let resolvedEmail: string | null = email || null;
  // Password is persisted only for the password-signup path. A Firebase account
  // never stores a password here — credential enrolment for a Firebase user goes
  // through a separate verified flow.
  let passwordToStore: string | null = null;

  if (idToken) {
    const claims = await verifyFirebaseToken(idToken, c.env.FIREBASE_PROJECT_ID || 'epaperspace');
    if (!claims) {
      return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid Firebase token'), 401);
    }
    firebaseUid = claims.sub;
    phoneNumber = claims.phone_number || null;
    authProvider = claims.firebase?.sign_in_provider || 'unknown';
    emailVerified = claims.email_verified ? 1 : 0;
    // Identity comes only from the verified token — the client-supplied email and
    // password are ignored on the Firebase path.
    resolvedEmail = claims.email || null;
  } else {
    if (!email || !password || password.length < 8) {
      return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid input or password too short'), 400);
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      return c.json(err(ErrorCode.BAD_REQUEST, 'Password must contain uppercase and digit'), 400);
    }
    passwordToStore = password;
  }

  if (!resolvedEmail && !phoneNumber) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Email or Phone Number required'), 400);
  }

  // Store lowercased so the address is one canonical value everywhere it is looked up:
  // /org-login, verify-email's findTenant, and the org_users UNIQUE index all fold case,
  // and a mixed-case row would be findable by none of them.
  if (resolvedEmail) resolvedEmail = resolvedEmail.trim().toLowerCase();

  const lookupKey = resolvedEmail || phoneNumber;
  const existing = await c.env.CONTROL_DB.prepare('SELECT id, status, slug FROM tenants WHERE LOWER(email) = ?').bind((lookupKey ?? '').toLowerCase()).first<{id: string, status: string, slug: string}>();
  if (existing) {
    if (existing.status === 'active' || existing.status === 'suspended') {
      return c.json(err(ErrorCode.CONFLICT, 'Account already exists. Please login.'), 409);
    } else if (existing.status === 'provisioning') {
      return c.json(err(ErrorCode.CONFLICT, 'Provisioning is currently in progress. Please wait a moment.'), 409);
    } else {
      await c.env.CONTROL_DB.prepare('DELETE FROM tenants WHERE id = ?').bind(existing.id).run();
    }
  }

  const tenantId = crypto.randomUUID();
  const slugBase = slugify(orgName).slice(0, 32);
  const slug = `${slugBase}-${crypto.randomUUID().slice(0, 4)}`;
  const ownerId = crypto.randomUUID();
  const hash = passwordToStore ? await hashPassword(passwordToStore) : null;

  try {
    await c.env.CONTROL_DB.batch([
      c.env.CONTROL_DB.prepare(
        'INSERT INTO tenants (id, slug, name, email, status, plan) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(tenantId, slug, orgName, lookupKey, 'pending', plan),
      c.env.CONTROL_DB.prepare(
        'INSERT INTO pending_owners (id, tenant_id, name, password_hash, firebase_uid, phone_number, email_verified, auth_provider) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(ownerId, tenantId, name, hash, firebaseUid, phoneNumber, emailVerified, authProvider),
      c.env.CONTROL_DB.prepare(
        'INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)'
      ).bind(crypto.randomUUID(), tenantId, 'tenant.created', 'system', JSON.stringify({ slug, email: lookupKey }))
    ]);
  } catch (e) {
    // The pre-check above races with concurrent signups: two requests for the same
    // email/phone can both pass the SELECT, then one loses the INSERT to a UNIQUE
    // constraint (tenants.email / pending_owners.phone_number). Map that collision to
    // the same 409 an existing account gets. Re-throw anything else — a real DB fault
    // must not masquerade as a duplicate.
    const msg = e instanceof Error ? e.message : String(e);
    if (/UNIQUE constraint failed/i.test(msg)) {
      return c.json(err(ErrorCode.CONFLICT, 'Account already exists. Please login.'), 409);
    }
    throw e;
  }

  // Password signups start unverified and must verify before provisioning. Google/phone
  // identities arrive already verified, so they provision immediately. Phone-only accounts
  // have no address to verify, so they also provision immediately.
  const verifyFirst = resolvedEmail !== null && !!passwordToStore && !emailVerified;

  if (verifyFirst) {
    c.executionCtx.waitUntil(
      sendSignupVerification(c.env, { id: tenantId, slug, name: orgName, status: 'pending' }, resolvedEmail!)
    );
  } else {
    // Fire provisioning for already-verified identities. A non-2xx response does NOT reject
    // the fetch, so we must inspect res.ok explicitly — otherwise a failed trigger would
    // leave the tenant stuck in 'pending' forever. On any failure (transport or HTTP) we
    // flip the tenant to 'provision_failed', which the self-service /reprovision endpoint
    // can retry. The final signup response is unaffected — provisioning is async.
    c.executionCtx.waitUntil((async () => {
      const markFailed = async (reason: string) => {
        console.error(`Provision trigger failed for ${slug}: ${reason}`);
        await c.env.CONTROL_DB.prepare(
          "UPDATE tenants SET status = 'provision_failed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
        ).bind(tenantId).run().catch(e => console.error('Failed to mark provision_failed', e));
      };
      try {
        const res = await c.env.PROVISION_WORKER.fetch(new Request('http://provision/api/provision/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug })
        }));
        if (!res.ok) await markFailed(`HTTP ${res.status}`);
      } catch (e) {
        await markFailed(String(e));
      }
    })());
  }

  const payload: OrgUserJwtPayload = {
    aud: 'tenant-portal',
    sub: tenantId,
    tenantSlug: slug,
    role: 'owner',
    userId: ownerId,
    exp: Math.floor(Date.now() / 1000) + 604800
  };
  const token = await signJwt(payload as unknown as Record<string, unknown>, c.env.ORG_JWT_SECRET);

  return c.json(ok({ token, slug }), 201);
});

orgAuthRouter.post('/org-login', async (c) => {
  const { email: rawEmail, password } = await c.req.json();

  if (!rawEmail || !password) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing credentials'), 400);
  // Addresses are case-insensitive in practice. Signup stores them lowercased, but rows
  // predating that rule are mixed-case, so both sides are folded on every lookup.
  const email = String(rawEmail).trim().toLowerCase();

  const tenant = await c.env.CONTROL_DB.prepare(
    'SELECT id, slug, email, status, plan FROM tenants WHERE LOWER(email) = ?'
  ).bind(email).first<Pick<TenantRow, 'id' | 'slug' | 'email' | 'status' | 'plan'>>();
  if (!tenant) return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid credentials'), 401);

  let valid = false;
  let role: OrgUserJwtPayload['role'] = 'owner';
  let userId: string | undefined;
  let permissions: string[] | undefined;

  // pending_owners only holds owners of not-yet-activated tenants; the row is deleted
  // on activation. Scope the lookup to pending/provisioning so a stale row can never
  // shadow the org_users credential path (and its old password) for an active tenant.
  const owner = (tenant.status === 'pending' || tenant.status === 'provisioning')
    ? await c.env.CONTROL_DB.prepare(
        'SELECT id, password_hash FROM pending_owners WHERE tenant_id = ?'
      ).bind(tenant.id).first<Pick<PendingOwnerRow, 'id' | 'password_hash'>>()
    : null;

  if (owner) {
    userId = owner.id;
    valid = owner.password_hash ? await verifyPassword(password, owner.password_hash) : false;
  } else if (tenant.status === 'active') {
    // Active tenant: verify against the tenant's own D1 org_users table directly.
    try {
      const db = getTenantDb(c.env, tenant.slug);
      const user = await db.prepare(
        'SELECT id, email, password_hash, name, role FROM org_users WHERE LOWER(email) = ?'
      ).bind(email).first<Pick<OrgUserRow, 'id' | 'email' | 'password_hash' | 'name' | 'role'>>();
      if (user && user.password_hash && await verifyPassword(password, user.password_hash)) {
        // Grants are read before the login is accepted: loadPermissions throws on a real
        // D1 failure, and falling back to role would widen a narrowed user for the 7-day
        // life of the token. A throw here lands in the catch below and 401s.
        const perms = await loadPermissions(db, user.id);
        valid = true;
        userId = user.id;
        role = (user.role as OrgUserJwtPayload['role']) ?? 'owner';
        permissions = perms;
      }
    } catch (e) {
      // Tenant DB binding missing/unavailable — fall through to 401.
      console.error(`org-login tenant DB lookup failed for ${tenant.slug}:`, e);
    }
  }

  if (!valid) return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid credentials'), 401);

  const payload: OrgUserJwtPayload = {
    aud: 'tenant-portal',
    sub: tenant.id,
    tenantSlug: tenant.slug,
    role,
    userId: userId!,
    exp: Math.floor(Date.now() / 1000) + 604800,
    // Omitted entirely when the user has no explicit grant, so can() falls back to role.
    ...(permissions ? { permissions } : {}),
  };
  const token = await signJwt(payload as unknown as Record<string, unknown>, c.env.ORG_JWT_SECRET);

  return c.json(ok({ token, slug: tenant.slug, status: tenant.status }));
});

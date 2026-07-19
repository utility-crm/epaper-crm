import { Hono } from 'hono';
import { Env } from './middleware';
import { ok, err, ErrorCode, OrgUserJwtPayload, TenantRow, PendingOwnerRow, OrgUserRow } from '@epaper/types';
import { signJwt } from './jwt';
import { hashPassword, verifyPassword } from './password';
import { verifyFirebaseToken } from './verifyFirebaseToken';
import { getTenantDb } from './db';

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

  const lookupKey = resolvedEmail || phoneNumber;
  const existing = await c.env.CONTROL_DB.prepare('SELECT id, status, slug FROM tenants WHERE email = ?').bind(lookupKey).first<{id: string, status: string, slug: string}>();
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

  // Fire provisioning. A non-2xx response does NOT reject the fetch, so we must
  // inspect res.ok explicitly — otherwise a failed trigger would leave the tenant
  // stuck in 'pending' forever. On any failure (transport or HTTP) we flip the
  // tenant to 'provision_failed', which the self-service /reprovision endpoint can
  // retry. The final signup response is unaffected — provisioning is async.
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
  const { email, password } = await c.req.json();

  if (!email || !password) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing credentials'), 400);

  const tenant = await c.env.CONTROL_DB.prepare(
    'SELECT id, slug, email, status, plan FROM tenants WHERE email = ?'
  ).bind(email).first<Pick<TenantRow, 'id' | 'slug' | 'email' | 'status' | 'plan'>>();
  if (!tenant) return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid credentials'), 401);

  let valid = false;
  let role: OrgUserJwtPayload['role'] = 'owner';
  let userId: string | undefined;

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
        'SELECT id, email, password_hash, name, role FROM org_users WHERE email = ?'
      ).bind(email).first<Pick<OrgUserRow, 'id' | 'email' | 'password_hash' | 'name' | 'role'>>();
      if (user && user.password_hash && await verifyPassword(password, user.password_hash)) {
        valid = true;
        userId = user.id;
        role = (user.role as OrgUserJwtPayload['role']) ?? 'owner';
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
    exp: Math.floor(Date.now() / 1000) + 604800
  };
  const token = await signJwt(payload as unknown as Record<string, unknown>, c.env.ORG_JWT_SECRET);

  return c.json(ok({ token, slug: tenant.slug, status: tenant.status }));
});

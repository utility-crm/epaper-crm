import { Hono } from 'hono';
import { Env, loadPermissions } from './middleware';
import { ok, err, ErrorCode, OrgUserJwtPayload, TenantRow, PendingOwnerRow } from '@epaper/types';
import { signJwt } from './jwt';
import { verifyFirebaseToken, FirebaseIdTokenClaims } from './verifyFirebaseToken';
import { getTenantDb } from './db';

export const firebaseAuthRouter = new Hono<{ Bindings: Env }>();

// Simple in-memory rate limiting map for SMS endpoints (IP -> { count, resetAt })
const smsRateLimits = new Map<string, { count: number; resetAt: number }>();

firebaseAuthRouter.post('/audit/sms-send', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';
  const now = Date.now();
  const limitRecord = smsRateLimits.get(ip);

  if (limitRecord) {
    if (now > limitRecord.resetAt) {
      smsRateLimits.set(ip, { count: 1, resetAt: now + 3600_000 });
    } else if (limitRecord.count >= 5) {
      return c.json(err(ErrorCode.FORBIDDEN, 'Too many SMS attempts. Please wait before retrying.'), 429);
    } else {
      limitRecord.count += 1;
    }
  } else {
    smsRateLimits.set(ip, { count: 1, resetAt: now + 3600_000 });
  }

  try {
    const body = await c.req.json().catch(() => ({}));
    const phonePrefix = typeof body.phonePrefix === 'string' ? body.phonePrefix.slice(0, 6) + 'XXXX' : 'unknown';
    const slug = typeof body.slug === 'string' ? body.slug : 'system';

    // Platform SMS controls. Firebase sends the OTP straight from the browser, so the
    // only lever the platform has is refusing the audit/billing record the client waits
    // on before it calls Firebase. Fail-open if this whole block throws: a broken
    // CONTROL_DB must not take reader login down with it.
    const cfg = await c.env.CONTROL_DB.prepare(
      'SELECT sms_disabled, sms_daily_cap FROM platform_config WHERE id = ?'
    ).bind('singleton').first<{ sms_disabled: number; sms_daily_cap: number }>();

    if (cfg?.sms_disabled) {
      return c.json(err(ErrorCode.FORBIDDEN, 'SMS verification is temporarily disabled. Please contact support.'), 429);
    }

    // tenant_id resolved from CONTROL_DB, never taken from the body — otherwise a caller
    // picks whose daily budget it spends (and every row landed with tenant_id = NULL).
    const tenant = await c.env.CONTROL_DB.prepare('SELECT id FROM tenants WHERE slug = ?')
      .bind(slug).first<{ id: string }>();
    const tenantId = tenant?.id ?? null;

    const used = await c.env.CONTROL_DB.prepare(
      "SELECT COUNT(*) AS n FROM audit_log WHERE action = 'auth.sms_send_requested'" +
      " AND tenant_id IS ? AND created_at >= datetime('now', 'start of day')"
    ).bind(tenantId).first<{ n: number }>();

    if ((used?.n ?? 0) >= (cfg?.sms_daily_cap ?? 50)) {
      return c.json(err(ErrorCode.FORBIDDEN, 'Daily SMS limit reached for this publication. Please contact support.'), 429);
    }

    await c.env.CONTROL_DB.prepare(
      'INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)'
    ).bind(
      crypto.randomUUID(),
      tenantId,
      'auth.sms_send_requested',
      slug,
      JSON.stringify({ ip, phonePrefix, stage: body.stage || 'reader' })
    ).run();
  } catch (e) {
    console.error('Failed to log SMS audit event:', e);
  }

  return c.json(ok({ allowed: true }));
});

// Stage 1: Publisher Verification Endpoint
firebaseAuthRouter.post('/verify-org', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const idToken = body.idToken;
  const projectId = c.env.FIREBASE_PROJECT_ID || 'epaperspace';

  if (!idToken || !projectId) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Missing ID token'), 400);
  }

  const claims: FirebaseIdTokenClaims | null = await verifyFirebaseToken(idToken, projectId);
  if (!claims) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Invalid Firebase token'), 401);
  }

  const provider = claims.firebase?.sign_in_provider || 'unknown';
  if (provider === 'password' && !claims.email_verified) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Please verify your email address before logging in.'), 403);
  }

  const email = claims.email;
  const phone = claims.phone_number;
  const uid = claims.sub;

  // Resolve the tenant by its stored identifier. Signup writes tenants.email =
  // (verified email || phone number), so a phone-only owner's tenant is keyed by
  // their phone here. Try the email claim first, then fall back to the phone claim —
  // the previous `if (email)`-only lookup 404'd every phone-only publisher.
  let tenant: Pick<TenantRow, 'id' | 'slug' | 'email' | 'status' | 'plan'> | null = null;
  for (const key of [email, phone]) {
    if (!key) continue;
    tenant = await c.env.CONTROL_DB.prepare(
      'SELECT id, slug, email, status, plan FROM tenants WHERE email = ?'
    ).bind(key).first();
    if (tenant) break;
  }

  if (!tenant) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'No publisher account associated with this Google/Phone account. Please sign up first.'), 404);
  }

  let role: OrgUserJwtPayload['role'] = 'owner';
  let userId: string | undefined;
  let permissions: string[] | undefined;

  // Check pending_owners first
  const owner = await c.env.CONTROL_DB.prepare(
    'SELECT id, name FROM pending_owners WHERE tenant_id = ?'
  ).bind(tenant.id).first<Pick<PendingOwnerRow, 'id' | 'name'>>();

  if (owner) {
    userId = owner.id;
    // Update pending owner record with firebase_uid
    await c.env.CONTROL_DB.prepare(
      'UPDATE pending_owners SET firebase_uid = ?, email_verified = 1, auth_provider = ? WHERE id = ?'
    ).bind(uid, provider, owner.id).run().catch(() => {});
  } else if (tenant.status === 'active') {
    // Active tenant: verify + link firebase_uid against the tenant's own D1 org_users table directly.
    // Resolve identity deterministically — firebase_uid is primary; fall back to a verified
    // email or present phone only when it uniquely maps to one org_user not already bound to a
    // different uid. (Permissive OR-matching with empty-string binds could link the wrong user.)
    const linkEmail = email && claims.email_verified ? email : null;
    try {
      const db = getTenantDb(c.env, tenant.slug);
      let user = await db.prepare(
        'SELECT id, email, role, firebase_uid FROM org_users WHERE firebase_uid = ?'
      ).bind(uid).first<{ id: string; email: string | null; role: string; firebase_uid: string | null }>();

      if (!user) {
        const candidates: { id: string; email: string | null; role: string; firebase_uid: string | null }[] = [];
        if (linkEmail) {
          const r = await db.prepare('SELECT id, email, role, firebase_uid FROM org_users WHERE email = ?')
            .bind(linkEmail).first<{ id: string; email: string | null; role: string; firebase_uid: string | null }>();
          if (r) candidates.push(r);
        }
        if (phone) {
          const r = await db.prepare('SELECT id, email, role, firebase_uid FROM org_users WHERE phone_number = ?')
            .bind(phone).first<{ id: string; email: string | null; role: string; firebase_uid: string | null }>();
          if (r) candidates.push(r);
        }
        const distinctIds = new Set(candidates.map((r) => r.id));
        if (distinctIds.size > 1) {
          return c.json(err(ErrorCode.CONFLICT, 'Account identifiers conflict. Please contact support.'), 409);
        }
        if (candidates.length && candidates[0].firebase_uid && candidates[0].firebase_uid !== uid) {
          return c.json(err(ErrorCode.CONFLICT, 'This email or phone is linked to a different account.'), 409);
        }
        user = candidates[0] ?? null;
      }

      if (user) {
        await db.prepare(
          'UPDATE org_users SET firebase_uid = ?, email_verified = ?, auth_provider = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(uid, claims.email_verified ? 1 : 0, provider, user.id).run();
        userId = user.id;
        role = (user.role as OrgUserJwtPayload['role']) ?? 'owner';
        permissions = await loadPermissions(db, user.id);
      }
    } catch (e) {
      console.error(`verify-org tenant DB lookup failed for ${tenant.slug}:`, e);
    }
  }

  if (!userId) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Could not resolve publisher profile'), 401);
  }

  const payload: OrgUserJwtPayload = {
    aud: 'tenant-portal',
    sub: tenant.id,
    tenantSlug: tenant.slug,
    role,
    userId,
    exp: Math.floor(Date.now() / 1000) + 604800,
    // Omitted entirely when the user has no explicit grant, so can() falls back to role.
    ...(permissions ? { permissions } : {}),
  };
  const token = await signJwt(payload as unknown as Record<string, unknown>, c.env.ORG_JWT_SECRET);

  return c.json(ok({ token, slug: tenant.slug, status: tenant.status }));
});

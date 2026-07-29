import { Hono } from 'hono';
import { Env } from './middleware';
import { ok, err, ErrorCode } from '@epaper/types';
import { hashPassword } from './password';
import { getTenantDb } from './db';
import { mintToken, consumeToken, sendAuthMail, allowSend } from '@epaper/auth-mail';

// Publisher email verification + password reset. Both flows hand out a single-use
// code by email and redeem it here; the code lives in CONTROL_DB (see
// packages/auth-mail), keyed by the publisher's login email.
export const verifyEmailRouter = new Hono<{ Bindings: Env }>();

type TenantLite = { id: string; slug: string; name: string; status: string };
type OwnerRow = { email_verified: number; auth_provider: string; password_hash: string | null };

// Both request endpoints answer identically whether or not the address exists. An
// attacker must not be able to use them to discover which emails have accounts.
const GENERIC_SEND = 'If that address has an account, an email is on its way.';

function linkBase(env: Env): string {
  return env.AUTH_LINK_BASE || 'https://epaperspace.com';
}

function findTenant(env: Env, email: string) {
  return env.CONTROL_DB.prepare(
    'SELECT id, slug, name, status FROM tenants WHERE email = ?'
  ).bind(email).first<TenantLite>();
}

// Where a publisher's credentials live depends on tenant lifecycle: pending_owners
// until the tenant is activated, the tenant's own org_users afterwards. Same split
// /org-login relies on — keep the two in step.
function ownerIsPending(tenant: TenantLite): boolean {
  return tenant.status === 'pending' || tenant.status === 'provisioning';
}

async function readOwner(env: Env, tenant: TenantLite, email: string): Promise<OwnerRow | null> {
  if (ownerIsPending(tenant)) {
    return env.CONTROL_DB.prepare(
      'SELECT email_verified, auth_provider, password_hash FROM pending_owners WHERE tenant_id = ?'
    ).bind(tenant.id).first<OwnerRow>();
  }
  try {
    return await getTenantDb(env, tenant.slug).prepare(
      'SELECT email_verified, auth_provider, password_hash FROM org_users WHERE email = ?'
    ).bind(email).first<OwnerRow>();
  } catch (e) {
    // Missing/unavailable tenant binding. Callers treat null as "no account", which
    // for these endpoints means a generic answer rather than a leaked error.
    console.error(`auth-mail: tenant DB lookup failed for ${tenant.slug}:`, e);
    return null;
  }
}

// pending_owners has no updated_at column (migrations/control/0011); org_users does.
async function writeOwner(env: Env, tenant: TenantLite, email: string, column: 'email_verified' | 'password_hash', value: number | string): Promise<boolean> {
  try {
    if (ownerIsPending(tenant)) {
      await env.CONTROL_DB.prepare(
        `UPDATE pending_owners SET ${column} = ? WHERE tenant_id = ?`
      ).bind(value, tenant.id).run();
    } else {
      await getTenantDb(env, tenant.slug).prepare(
        `UPDATE org_users SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?`
      ).bind(value, email).run();
    }
    return true;
  } catch (e) {
    console.error(`auth-mail: failed to update ${column} for ${tenant.slug}:`, e);
    return false;
  }
}

async function mailToken(env: Env, tenant: TenantLite, email: string, purpose: 'verify_email' | 'password_reset'): Promise<void> {
  const code = await mintToken(env.CONTROL_DB, { purpose, subject: email, slug: tenant.slug });
  const path = purpose === 'verify_email' ? 'verify' : 'reset';
  await sendAuthMail(env, {
    to: email,
    slug: tenant.slug,
    brandName: tenant.name,
    purpose,
    url: `${linkBase(env)}/auth/${path}?code=${code}`,
  });
}

// Exported so /signup can mail the first verification link without duplicating any
// of the above. Swallows its own failures: signup must succeed even if mail doesn't.
export async function sendSignupVerification(env: Env, tenant: TenantLite, email: string): Promise<void> {
  try {
    await mailToken(env, tenant, email, 'verify_email');
  } catch (e) {
    console.error('auth-mail: signup verification send failed:', e);
  }
}

verifyEmailRouter.post('/verify-email/send', async (c) => {
  const { email } = await c.req.json().catch(() => ({ email: undefined }));
  if (!email || typeof email !== 'string') {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Email required'), 400);
  }

  // Throttled callers get the same generic answer as everyone else — a distinct
  // "too many requests" reply would itself confirm the address is worth retrying.
  if (allowSend(`verify:${email}`)) {
    const tenant = await findTenant(c.env, email);
    if (tenant) {
      const owner = await readOwner(c.env, tenant, email);
      // Nothing to verify for an already-verified account, and nothing to send to a
      // Google/phone identity — those arrive pre-verified from Firebase.
      if (owner && !owner.email_verified && owner.password_hash) {
        await mailToken(c.env, tenant, email, 'verify_email');
      }
    }
  }

  return c.json(ok({ message: GENERIC_SEND }));
});

verifyEmailRouter.post('/verify-email/confirm', async (c) => {
  const { code } = await c.req.json().catch(() => ({ code: undefined }));
  const claim = await consumeToken(c.env.CONTROL_DB, code, 'verify_email');
  if (!claim) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'This link is invalid, expired, or already used. Request a new one.'), 400);
  }

  const email = claim.subject;
  const tenant = await findTenant(c.env, email);
  if (!tenant) {
    return c.json(err(ErrorCode.NOT_FOUND, 'Account no longer exists'), 404);
  }
  if (!(await writeOwner(c.env, tenant, email, 'email_verified', 1))) {
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Could not confirm your email. Please try again.'), 500);
  }

  return c.json(ok({ slug: tenant.slug, email }));
});

verifyEmailRouter.post('/password-reset/request', async (c) => {
  const { email } = await c.req.json().catch(() => ({ email: undefined }));
  if (!email || typeof email !== 'string') {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Email required'), 400);
  }

  if (allowSend(`reset:${email}`)) {
    const tenant = await findTenant(c.env, email);
    if (tenant) {
      const owner = await readOwner(c.env, tenant, email);
      // No password stored means a Firebase-only identity: there is nothing to reset,
      // and mailing a reset link would be misleading.
      if (owner?.password_hash) {
        await mailToken(c.env, tenant, email, 'password_reset');
      }
    }
  }

  return c.json(ok({ message: 'If that address has an account, a reset link is on its way.' }));
});

verifyEmailRouter.post('/password-reset/confirm', async (c) => {
  const { code, newPassword } = await c.req.json().catch(() => ({ code: undefined, newPassword: undefined }));

  // Same policy /signup enforces — a reset must not be a way to set a weaker password.
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Password must be at least 8 characters'), 400);
  }
  if (!/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Password must contain uppercase and digit'), 400);
  }

  // Policy is checked before the code is spent, so a rejected password leaves the
  // link usable and the user can simply try a stronger one.
  const claim = await consumeToken(c.env.CONTROL_DB, code, 'password_reset');
  if (!claim) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'This link is invalid, expired, or already used. Request a new one.'), 400);
  }

  const email = claim.subject;
  const tenant = await findTenant(c.env, email);
  if (!tenant) {
    return c.json(err(ErrorCode.NOT_FOUND, 'Account no longer exists'), 404);
  }
  if (!(await writeOwner(c.env, tenant, email, 'password_hash', await hashPassword(newPassword)))) {
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Could not reset your password. Please try again.'), 500);
  }

  return c.json(ok({ slug: tenant.slug }));
});

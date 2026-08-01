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

export type TenantLite = { id: string; slug: string; name: string; status: string };
type OwnerRow = { email_verified: number; auth_provider: string; password_hash: string | null };

// Both request endpoints answer identically whether or not the address exists. An
// attacker must not be able to use them to discover which emails have accounts.
const GENERIC_SEND = 'If that address has an account, an email is on its way.';

function linkBase(env: Env): string {
  return env.AUTH_LINK_BASE || 'https://epaperspace.com';
}

function findTenant(env: Env, email: string) {
  // LOWER() on both sides: rows predating the lowercase-on-write rule (and any created by
  // a path that skipped it) are stored mixed-case, and an exact match silently misses them
  // — which reads as "no such account" and swallows the mail.
  return env.CONTROL_DB.prepare(
    'SELECT id, slug, name, status FROM tenants WHERE LOWER(email) = ?'
  ).bind(email.toLowerCase()).first<TenantLite>();
}

// Where a publisher's credentials live depends on tenant lifecycle: pending_owners
// until the tenant is activated, the tenant's own org_users afterwards. Same split
// /org-login relies on — keep the two in step.
function ownerIsPending(tenant: TenantLite): boolean {
  return tenant.status === 'pending' || tenant.status === 'provisioning';
}

function pendingOwner(env: Env, tenant: TenantLite): Promise<OwnerRow | null> {
  return env.CONTROL_DB.prepare(
    'SELECT email_verified, auth_provider, password_hash FROM pending_owners WHERE tenant_id = ?'
  ).bind(tenant.id).first<OwnerRow>();
}

async function readOwner(env: Env, tenant: TenantLite, email: string): Promise<OwnerRow | null> {
  if (ownerIsPending(tenant)) return pendingOwner(env, tenant);
  try {
    const row = await getTenantDb(env, tenant.slug).prepare(
      'SELECT email_verified, auth_provider, password_hash FROM org_users WHERE LOWER(email) = ?'
    ).bind(email.toLowerCase()).first<OwnerRow>();
    if (row) return row;
    // Active tenant, no org_users row: activation never migrated the owner across (seen on
    // a live tenant whose org_users was empty while pending_owners still held the row).
    // Status is not a reliable pointer to where the row lives, so fall back rather than
    // report "no account" — which silently swallowed the verification mail.
  } catch (e) {
    // Missing/unavailable tenant binding — the tenant D1 exists but no worker binds it.
    console.error(`auth-mail: tenant DB lookup failed for ${tenant.slug}:`, e);
  }
  // Only for a tenant that is still allowed to sign in. Without this guard a deleted or
  // suspended tenant's stale pending_owners row would resurrect reset/verify mail for it.
  if (tenant.status === 'deleted' || tenant.status === 'suspended') return null;
  return pendingOwner(env, tenant);
}

// pending_owners has no updated_at column (migrations/control/0011); org_users does.
async function writeOwner(env: Env, tenant: TenantLite, email: string, column: 'email_verified' | 'password_hash', value: number | string): Promise<boolean> {
  if (!ownerIsPending(tenant)) {
    try {
      const res = await getTenantDb(env, tenant.slug).prepare(
        `UPDATE org_users SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE LOWER(email) = ?`
      ).bind(value, email.toLowerCase()).run();
      // An UPDATE that matched nothing is not a success. It used to return true regardless,
      // so confirming a link on a tenant whose org_users row was never migrated answered 200
      // while leaving email_verified = 0 — the publisher stayed blocked with nothing to retry.
      if (res.meta.changes > 0) return true;
    } catch (e) {
      console.error(`auth-mail: failed to update ${column} for ${tenant.slug}:`, e);
    }
    // Mirrors readOwner: the row may still be in pending_owners despite an active status.
    if (tenant.status === 'deleted' || tenant.status === 'suspended') return false;
  }
  try {
    const res = await env.CONTROL_DB.prepare(
      `UPDATE pending_owners SET ${column} = ? WHERE tenant_id = ?`
    ).bind(value, tenant.id).run();
    return res.meta.changes > 0;
  } catch (e) {
    console.error(`auth-mail: failed to update ${column} for ${tenant.slug}:`, e);
    return false;
  }
}

export async function mailToken(env: Env, tenant: TenantLite, email: string, purpose: 'verify_email' | 'password_reset'): Promise<void> {
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
  const raw = await c.req.json().catch(() => ({ email: undefined }));
  if (!raw.email || typeof raw.email !== 'string') {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Email required'), 400);
  }
  // Canonicalize once: tenants/owners are stored lowercased (Firebase claims), so a
  // casing variant must share the throttle key and match the stored records.
  const email = raw.email.trim().toLowerCase();

  // Throttled callers get the same generic answer as everyone else — a distinct
  // "too many requests" reply would itself confirm the address is worth retrying.
  if (allowSend(`verify:${email}`)) {
    const tenant = await findTenant(c.env, email);
    if (tenant) {
      const owner = await readOwner(c.env, tenant, email);
      // Nothing to verify for an already-verified account. Don't also require a stored
      // password: a Firebase-created publisher has password_hash NULL, and gating on it
      // made resend a silent no-op for them.
      if (owner && !owner.email_verified) {
        // A send failure must not change the answer below — that would tell an attacker
        // the address exists.
        await mailToken(c.env, tenant, email, 'verify_email')
          .catch((e) => console.error('auth-mail: verify send failed:', e));
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
  // Address first, then the slug the token was minted with. The fallback matters for an
  // address added after signup via /add-email: it lives on org_users but is not
  // tenants.email, so the address lookup alone would report the account as gone.
  const tenant = (await findTenant(c.env, email))
    ?? (claim.slug
      ? await c.env.CONTROL_DB.prepare('SELECT id, slug, name, status FROM tenants WHERE slug = ?')
          .bind(claim.slug).first<TenantLite>()
      : null);
  if (!tenant) {
    return c.json(err(ErrorCode.NOT_FOUND, 'Account no longer exists'), 404);
  }
  if (!(await writeOwner(c.env, tenant, email, 'email_verified', 1))) {
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Could not confirm your email. Please try again.'), 500);
  }

  // If this is a pending tenant (awaiting first verification before provisioning), trigger
  // provisioning now. Already-provisioning/active/failed tenants are left alone — this is
  // only for the signup verification gate.
  if (tenant.status === 'pending') {
    c.executionCtx.waitUntil((async () => {
      try {
        const res = await c.env.PROVISION_WORKER.fetch(new Request('http://provision/api/provision/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: tenant.slug })
        }));
        if (!res.ok) {
          console.error(`Provision trigger failed after verify for ${tenant.slug}: HTTP ${res.status}`);
          await c.env.CONTROL_DB.prepare(
            "UPDATE tenants SET status = 'provision_failed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
          ).bind(tenant.id).run().catch(e => console.error('Failed to mark provision_failed', e));
        }
      } catch (e) {
        console.error(`Provision trigger failed after verify for ${tenant.slug}:`, e);
        await c.env.CONTROL_DB.prepare(
          "UPDATE tenants SET status = 'provision_failed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
        ).bind(tenant.id).run().catch(e => console.error('Failed to mark provision_failed', e));
      }
    })());
  }

  return c.json(ok({ slug: tenant.slug, email }));
});

verifyEmailRouter.post('/password-reset/request', async (c) => {
  const raw = await c.req.json().catch(() => ({ email: undefined }));
  if (!raw.email || typeof raw.email !== 'string') {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Email required'), 400);
  }
  const email = raw.email.trim().toLowerCase();

  if (allowSend(`reset:${email}`)) {
    const tenant = await findTenant(c.env, email);
    if (tenant) {
      const owner = await readOwner(c.env, tenant, email);
      // No password stored means a Firebase-only identity: there is nothing to reset,
      // and mailing a reset link would be misleading.
      if (owner?.password_hash) {
        await mailToken(c.env, tenant, email, 'password_reset')
          .catch((e) => console.error('auth-mail: reset send failed:', e));
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

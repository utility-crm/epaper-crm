import { Hono } from 'hono';
import { Env, orgUserAuth } from './middleware';
import { ok, err, ErrorCode } from '@epaper/types';

// Credential endpoints (signup, org-login, verify-org) moved to the epaper-auth worker.
// This router now serves only the provisioning-lifecycle endpoints, which are coupled
// to PROVISION_WORKER + tenant activation and are gated by an existing org session.
export const orgAuthRouter = new Hono<{ Bindings: Env; Variables: { tenantId: string; tenantSlug: string; orgRole: string } }>();

/**
 * Owner verification state for a tenant that has not been activated yet. The row lives in
 * pending_owners until activation moves it into the tenant's own org_users, so this is only
 * meaningful while status is pending/provisioning — which is exactly the window the
 * provisioning gate cares about.
 *
 * Returns null when there is no row to read: callers treat that as "cannot prove it is
 * unverified" and fall open, matching how the content worker's write gate behaves.
 */
async function pendingOwnerVerification(env: Env, tenantId: string): Promise<{ email: string | null; verified: boolean } | null> {
  try {
    const row = await env.CONTROL_DB.prepare(
      'SELECT t.email AS email, o.email_verified AS email_verified FROM pending_owners o JOIN tenants t ON t.id = o.tenant_id WHERE o.tenant_id = ?'
    ).bind(tenantId).first<{ email: string | null; email_verified: number | null }>();
    if (!row) return null;
    return { email: row.email, verified: !!row.email_verified };
  } catch (e) {
    console.error('pendingOwnerVerification failed', e);
    return null;
  }
}

orgAuthRouter.get('/provision-status', orgUserAuth, async (c) => {
  const tenant = await c.env.CONTROL_DB.prepare('SELECT status, provision_run_id FROM tenants WHERE id = ?')
    .bind(c.var.tenantId).first<{ status: string; provision_run_id: string | null }>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);

  // A tenant sitting at 'pending' is ambiguous on its own: it may be waiting for the
  // provision trigger, or waiting for the owner to click the verification link (signup no
  // longer provisions an unverified password account). Report which, so the portal can show
  // the verification step instead of a progress bar that will never move.
  let awaiting_verification = false;
  let email: string | null = null;
  if (tenant.status === 'pending') {
    const owner = await pendingOwnerVerification(c.env, c.var.tenantId);
    // Only an address that exists and is provably unverified holds provisioning. A missing
    // row, or a phone-only account with no address, falls open.
    if (owner && owner.email && !owner.verified) {
      awaiting_verification = true;
      email = owner.email;
    }
  }

  return c.json(ok({ ...tenant, awaiting_verification, email }));
});

// Tenant self-service: retry provisioning after a provision_failed state
orgAuthRouter.post('/reprovision', orgUserAuth, async (c) => {
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id, slug, status FROM tenants WHERE id = ?')
    .bind(c.var.tenantId).first<{id: string; slug: string; status: string}>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);

  if (!['provision_failed', 'pending'].includes(tenant.status)) {
    return c.json(err(ErrorCode.BAD_REQUEST, `Cannot reprovision from status: ${tenant.status}`), 400);
  }

  // 'pending' is still in the allowlist above, so without this check the retry button on the
  // stuck screen would provision an account whose address was never confirmed — routing
  // around the signup gate entirely. Only refuse when the address is provably unverified.
  if (tenant.status === 'pending') {
    const owner = await pendingOwnerVerification(c.env, tenant.id);
    if (owner && owner.email && !owner.verified) {
      return c.json(err(ErrorCode.FORBIDDEN, 'Verify your email address before we set up your workspace.'), 403);
    }
  }

  // Delegate to the internal reprovision endpoint (which fires the GitHub workflow)
  const res = await c.env.PROVISION_WORKER.fetch(
    new Request('http://provision/api/provision/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: tenant.slug })
    })
  );

  if (!res.ok) {
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'Failed to trigger reprovisioning'), 500);
  }

  // Mark as provisioning again
  await c.env.CONTROL_DB.batch([
    c.env.CONTROL_DB.prepare(
      'UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).bind('provisioning', tenant.id),
    c.env.CONTROL_DB.prepare(
      'INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), tenant.id, 'tenant.reprovision_self_service', tenant.id, JSON.stringify({ slug: tenant.slug }))
  ]);

  return c.json(ok({ reprovisioning: true }));
});

orgAuthRouter.post('/verify-provisioning', orgUserAuth, async (c) => {
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id, slug, status, provision_run_id FROM tenants WHERE id = ?').bind(c.var.tenantId).first<{id: string, slug: string, status: string, provision_run_id: string | null}>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);

  if (tenant.status !== 'provisioning' && tenant.status !== 'provision_failed') {
    return c.json(ok({ status: tenant.status }));
  }

  if (!tenant.provision_run_id) {
    return c.json(ok({ status: tenant.status }));
  }

  try {
    const res = await c.env.PROVISION_WORKER.fetch(`http://provision/api/provision/debug/${tenant.provision_run_id}`);
    if (!res.ok) return c.json(ok({ status: tenant.status }));
    
    const data = await res.json() as any;
    if (data.data?.status === 'completed') {
      if (data.data?.conclusion === 'success') {
        const reqBody = {
          d1_id: `epaper-${tenant.slug}`,
          r2_bucket: `epaper-${tenant.slug}`
        };
        const activateRes = await c.env.ADMIN_WORKER.fetch(new Request(`http://admin/api/tenants/internal/${tenant.slug}/activate`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody)
        }));
        
        if (activateRes.ok) {
          return c.json(ok({ status: 'active', recovered: true }));
        }
      } else {
        await c.env.CONTROL_DB.prepare('UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind('provision_failed', tenant.id).run();
        return c.json(ok({ status: 'provision_failed', recovered: true }));
      }
    }
  } catch (e) {
    console.error("Verification failed", e);
  }

  return c.json(ok({ status: tenant.status }));
});

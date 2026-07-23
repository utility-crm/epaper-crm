import { Hono } from 'hono';
import { Env, orgUserAuth } from './middleware';
import { ok, err, ErrorCode } from '@epaper/types';

// Credential endpoints (signup, org-login, verify-org) moved to the epaper-auth worker.
// This router now serves only the provisioning-lifecycle endpoints, which are coupled
// to PROVISION_WORKER + tenant activation and are gated by an existing org session.
export const orgAuthRouter = new Hono<{ Bindings: Env; Variables: { tenantId: string; tenantSlug: string; orgRole: string } }>();

orgAuthRouter.get('/provision-status', orgUserAuth, async (c) => {
  const tenant = await c.env.CONTROL_DB.prepare('SELECT status, provision_run_id FROM tenants WHERE id = ?').bind(c.var.tenantId).first();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  return c.json(ok(tenant));
});

// Tenant self-service: retry provisioning after a provision_failed state
orgAuthRouter.post('/reprovision', orgUserAuth, async (c) => {
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id, slug, status FROM tenants WHERE id = ?')
    .bind(c.var.tenantId).first<{id: string; slug: string; status: string}>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);

  if (!['provision_failed', 'pending'].includes(tenant.status)) {
    return c.json(err(ErrorCode.BAD_REQUEST, `Cannot reprovision from status: ${tenant.status}`), 400);
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

import { Hono } from 'hono';
import { Env, adminAuth } from './middleware';
import { ok, err, ErrorCode, TenantRow } from '@epaper/types';

export const tenantsRouter = new Hono<{ Bindings: Env; Variables: { adminId: string; adminRole: string } }>();

tenantsRouter.patch('/internal/:slug/activate', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();
  const { d1_id, r2_bucket } = body;
  
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id, email, status FROM tenants WHERE slug = ?').bind(slug).first<{id: string, email: string, status: string}>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  
  if (tenant.status === 'pending_deletion') {
    return c.json(ok({ activated: false, reason: 'Tenant is pending deletion' }));
  }
  
  // Find the pending owner
  const pendingOwner = await c.env.CONTROL_DB.prepare('SELECT * FROM pending_owners WHERE tenant_id = ?').bind(tenant.id).first<{id: string; name: string; password_hash: string; role: string}>();

  if (pendingOwner) {
    // Call the content worker to insert the owner into the tenant's new org_users table
    const migrateRes = await c.env.CONTENT_WORKER.fetch(`http://internal/internal/${slug}/migrate-owner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: pendingOwner.id,
        email: tenant.email,
        name: pendingOwner.name,
        password_hash: pendingOwner.password_hash,
        role: pendingOwner.role || 'owner'
      })
    });

    if (!migrateRes.ok) {
      console.error(`Failed to migrate pending owner for ${slug}`);
    } else {
      // Remove the pending owner since they are now fully migrated
      await c.env.CONTROL_DB.prepare('DELETE FROM pending_owners WHERE tenant_id = ?').bind(tenant.id).run();
    }
  }
  
  await c.env.CONTROL_DB.batch([
    c.env.CONTROL_DB.prepare(
      'UPDATE tenants SET status = ?, d1_id = ?, r2_bucket = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
    ).bind('active', d1_id, r2_bucket, slug),
    c.env.CONTROL_DB.prepare(
      'INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), tenant.id, 'tenant.activated', 'system', '{}')
  ]);
  
  return c.json(ok({ activated: true }));
});

tenantsRouter.patch('/internal/:slug/delete-complete', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(slug).first<{id: string}>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  
  await c.env.CONTROL_DB.batch([
    c.env.CONTROL_DB.prepare(
      'UPDATE tenants SET status = ?, d1_id = NULL, r2_bucket = NULL, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
    ).bind('deleted', slug),
    c.env.CONTROL_DB.prepare(
      'INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), tenant.id, 'tenant.deleted', 'system', '{}')
  ]);
  
  return c.json(ok({ deleted: true }));
});

// Called by provision worker webhook when the GitHub Actions job fails
tenantsRouter.patch('/internal/:slug/provision-failed', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id, email, name FROM tenants WHERE slug = ?').bind(slug).first<{id: string; email: string; name: string}>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);

  await c.env.CONTROL_DB.batch([
    c.env.CONTROL_DB.prepare(
      'UPDATE tenants SET status = ?, d1_id = NULL, r2_bucket = NULL, provision_run_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
    ).bind('provision_failed', slug),
    c.env.CONTROL_DB.prepare(
      'INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), tenant.id, 'tenant.provision_failed', 'system', JSON.stringify({ slug }))
  ]);

  return c.json(ok({ failed: true }));
});

// Called by org-auth (tenant self-service) or admin to re-trigger provisioning
tenantsRouter.post('/internal/:slug/reprovision', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id, status FROM tenants WHERE slug = ?').bind(slug).first<{id: string; status: string}>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);

  // Only allow re-trigger from a failed or pending state
  if (!['provision_failed', 'pending'].includes(tenant.status)) {
    return c.json(err(ErrorCode.BAD_REQUEST, `Cannot reprovision from status: ${tenant.status}`), 400);
  }

  await c.env.CONTROL_DB.batch([
    c.env.CONTROL_DB.prepare(
      'UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
    ).bind('provisioning', slug),
    c.env.CONTROL_DB.prepare(
      'INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), tenant.id, 'tenant.reprovision_requested', 'system', JSON.stringify({ slug }))
  ]);

  // Fire-and-forget: trigger the provision workflow
  c.executionCtx.waitUntil(
    c.env.PROVISION_WORKER.fetch(new Request('http://provision/api/provision/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug })
    })).catch(e => console.error('Re-provision trigger failed', e))
  );

  return c.json(ok({ reprovisioning: true }));
});

tenantsRouter.delete('/internal/:slug/deprovision', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(slug).first<{id: string}>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  
  await c.env.CONTROL_DB.batch([
    c.env.CONTROL_DB.prepare('UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?').bind('pending_deletion', slug),
    c.env.CONTROL_DB.prepare('INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), tenant.id, 'tenant.delete_initiated', 'system_self_serve', '{}')
  ]);
  
  return c.json(ok({ deleting: true, pending: true }));
});

tenantsRouter.use('/*', adminAuth);

tenantsRouter.get('/', async (c) => {
  const status = c.req.query('status');
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = 20;
  const offset = (page - 1) * pageSize;
  
  let query = 'SELECT id, slug, name, email, plan, status, d1_id, r2_bucket, provision_run_id, razorpay_plan_id, razorpay_sub_id, custom_domain, domain_verified, custom_storage_mb, custom_views_per_day, custom_simultaneous_editions, custom_papers_per_day, created_at, updated_at FROM tenants';
  let countQuery = 'SELECT count(*) as total FROM tenants';
  const params: string[] = [];
  
  if (status) {
    query += ' WHERE status = ?';
    countQuery += ' WHERE status = ?';
    params.push(status);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  
  const [itemsRes, countRes] = await c.env.CONTROL_DB.batch([
    c.env.CONTROL_DB.prepare(query).bind(...params, pageSize, offset),
    c.env.CONTROL_DB.prepare(countQuery).bind(...params)
  ]);
  
  const total = (countRes.results[0] as unknown as { total: number })?.total ?? 0;
  
  return c.json(ok({
    items: itemsRes.results,
    total,
    page,
    pageSize
  }));
});

tenantsRouter.get('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await c.env.CONTROL_DB.prepare(
    'SELECT id, slug, name, email, plan, status, d1_id, r2_bucket, provision_run_id, razorpay_plan_id, razorpay_sub_id, custom_domain, domain_verified, custom_storage_mb, custom_views_per_day, custom_simultaneous_editions, custom_papers_per_day, created_at, updated_at FROM tenants WHERE slug = ?'
  ).bind(slug).first();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  return c.json(ok(tenant));
});

tenantsRouter.patch('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(slug).first<{id: string}>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  
  if (body.plan) {
    const tenantWithSub = await c.env.CONTROL_DB.prepare('SELECT razorpay_sub_id FROM tenants WHERE slug = ?').bind(slug).first<{razorpay_sub_id: string | null}>();
    await c.env.CONTROL_DB.prepare('UPDATE tenants SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?').bind(body.plan, slug).run();
    await c.env.CONTROL_DB.prepare('INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), tenant.id, 'tenant.plan_updated', c.var.adminId, JSON.stringify({ plan: body.plan })).run();
      
    if (tenantWithSub?.razorpay_sub_id) {
      c.executionCtx.waitUntil(
        c.env.BILLING_WORKER.fetch(new Request(`http://billing/internal/billing/platform/${slug}/subscription`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planName: body.plan })
        })).catch(e => console.error('Subscription update trigger failed', e))
      );
    }
  }
  
  if (body.status === 'suspended') {
    await c.env.CONTROL_DB.prepare('UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?').bind('suspended', slug).run();
    await c.env.CONTROL_DB.prepare('INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), tenant.id, 'tenant.suspended', c.var.adminId, '{}').run();
  } else if (body.status === 'active') {
    await c.env.CONTROL_DB.prepare('UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?').bind('active', slug).run();
    await c.env.CONTROL_DB.prepare('INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), tenant.id, 'tenant.unsuspended', c.var.adminId, '{}').run();
  }
  
  if (body.custom_storage_mb !== undefined || body.custom_views_per_day !== undefined || body.custom_simultaneous_editions !== undefined || body.custom_papers_per_day !== undefined) {
    const existing = await c.env.CONTROL_DB.prepare('SELECT custom_storage_mb, custom_views_per_day, custom_simultaneous_editions, custom_papers_per_day FROM tenants WHERE slug = ?').bind(slug).first<any>();
    const storage = body.custom_storage_mb !== undefined ? body.custom_storage_mb : existing.custom_storage_mb;
    const views = body.custom_views_per_day !== undefined ? body.custom_views_per_day : existing.custom_views_per_day;
    const editions = body.custom_simultaneous_editions !== undefined ? body.custom_simultaneous_editions : existing.custom_simultaneous_editions;
    const papers = body.custom_papers_per_day !== undefined ? body.custom_papers_per_day : existing.custom_papers_per_day;
    
    await c.env.CONTROL_DB.prepare('UPDATE tenants SET custom_storage_mb = ?, custom_views_per_day = ?, custom_simultaneous_editions = ?, custom_papers_per_day = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?')
      .bind(storage, views, editions, papers, slug).run();
      
    await c.env.CONTROL_DB.prepare('INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), tenant.id, 'tenant.custom_limits_updated', c.var.adminId, JSON.stringify({ storage, views, editions, papers })).run();
  }
  
  return c.json(ok({ updated: true }));
});

tenantsRouter.delete('/:slug', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(slug).first<{id: string}>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  
  await c.env.CONTROL_DB.batch([
    c.env.CONTROL_DB.prepare('UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?').bind('pending_deletion', slug),
    c.env.CONTROL_DB.prepare('INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), tenant.id, 'tenant.delete_initiated', c.var.adminId, '{}')
  ]);
  
  return c.json(ok({ deleting: true, pending: true }));
});

// Endpoint for frontend to verify stuck provisioning
tenantsRouter.post('/internal/:slug/verify-provisioning', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id, status, provision_run_id FROM tenants WHERE slug = ?').bind(slug).first<{id: string, status: string, provision_run_id: string | null}>();
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
        // Manually activate since webhook dropped
        const reqBody = {
          d1_id: `epaper-${slug}`,
          r2_bucket: `epaper-${slug}`
        };
        // Reuse the activate logic by self-calling
        const activateRes = await c.env.ADMIN_WORKER.fetch(new Request(`http://admin/api/tenants/internal/${slug}/activate`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(reqBody)
        }));
        
        if (activateRes.ok) {
          return c.json(ok({ status: 'active', recovered: true }));
        }
      } else {
        // Mark as failed
        await c.env.CONTROL_DB.prepare('UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind('provision_failed', tenant.id).run();
        return c.json(ok({ status: 'provision_failed', recovered: true }));
      }
    }
  } catch (e) {
    console.error("Verification failed", e);
  }

  return c.json(ok({ status: tenant.status }));
});

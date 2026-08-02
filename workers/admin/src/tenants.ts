import { Hono } from 'hono';
import { Env, adminAuth } from './middleware';
import { requireSuperadmin } from './platform-config';
import { ok, err, ErrorCode, TenantRow } from '@epaper/types';

export const tenantsRouter = new Hono<{ Bindings: Env; Variables: { adminId: string; adminRole: string } }>();

/** Headers for calling the content worker's internal endpoints (shared-secret auth). */
function internalHeaders(env: Record<string, unknown>): Record<string, string> {
  const secret = env.INTERNAL_SECRET;
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new Error('INTERNAL_SECRET is not configured');
  }
  return { 'X-Internal-Secret': secret };
}


tenantsRouter.patch('/internal/:slug/activate', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();
  const { d1_id, r2_bucket } = body;
  
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id, email, status FROM tenants WHERE slug = ?').bind(slug).first<{id: string, email: string, status: string}>();
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  
  if (tenant.status === 'pending_deletion') {
    return c.json(ok({ activated: false, reason: 'Tenant is pending deletion' }));
  }
  
  // Find the pending owner. pending_owners has no `role` column — the owner is always
  // the owner. It DOES carry the Firebase identity (firebase_uid/phone_number/
  // email_verified/auth_provider) captured at signup, which must survive activation or
  // a Google/phone owner is locked out of their tenant once it goes active.
  const pendingOwner = await c.env.CONTROL_DB.prepare('SELECT * FROM pending_owners WHERE tenant_id = ?').bind(tenant.id).first<{id: string; name: string; password_hash: string | null; firebase_uid: string | null; phone_number: string | null; email_verified: number; auth_provider: string}>();

  if (pendingOwner) {
    try {
      // Call the content worker to insert the owner into the tenant's new org_users table
      const migrateRes = await c.env.CONTENT_WORKER.fetch(`http://internal/internal/${slug}/migrate-owner`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...internalHeaders(c.env) },
        body: JSON.stringify({
          id: pendingOwner.id,
          email: tenant.email,
          name: pendingOwner.name,
          password_hash: pendingOwner.password_hash,
          role: 'owner',
          firebase_uid: pendingOwner.firebase_uid,
          phone_number: pendingOwner.phone_number,
          email_verified: pendingOwner.email_verified,
          auth_provider: pendingOwner.auth_provider
        })
      });

      if (!migrateRes.ok) {
        console.error(`Failed to migrate pending owner for ${slug}`);
      } else {
        // Remove the pending owner since they are now fully migrated
        await c.env.CONTROL_DB.prepare('DELETE FROM pending_owners WHERE tenant_id = ?').bind(tenant.id).run();
      }
    } catch (e) {
      // Missing INTERNAL_SECRET or a transport error: log and continue, matching the
      // pre-existing behavior on a failed migrate (the pending_owners row is left intact).
      console.error(`Failed to migrate pending owner for ${slug}:`, e);
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

/**
 * Manual publisher email verification (superadmin escape hatch).
 *
 * The verification mail is the only way a publisher normally clears the content worker's
 * write gate (requireVerifiedEmail). When delivery is broken — bounced domain, Resend
 * outage, a typo'd-but-reachable-out-of-band address — the publisher is locked out of
 * publishing with nothing to retry, since resend just mails the same dead address again.
 * This flips the flag directly, no mail involved.
 *
 * Where the flag lives depends on tenant lifecycle, and status is NOT a reliable pointer
 * to which (see verify-email.ts readOwner — active tenants are seen with the row still in
 * pending_owners because activation never migrated it). So both stores are attempted and
 * success is "at least one row changed", mirroring writeOwner.
 */
async function ownerEmailFor(env: Env, slug: string) {
  return env.CONTROL_DB.prepare('SELECT id, slug, email, status FROM tenants WHERE slug = ?')
    .bind(slug).first<{ id: string; slug: string; email: string | null; status: string }>();
}

tenantsRouter.get('/:slug/email-verification', requireSuperadmin, async (c) => {
  // Non-null: the route cannot match without the param. Asserted because the inline
  // middleware above makes this handler opaque to Hono's param inference.
  const slug = c.req.param('slug')!;
  const tenant = await ownerEmailFor(c.env, slug);
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);

  // A tenant with no address (phone-only owner) has nothing to verify — the write gate
  // passes it already, so report it as such rather than offering a button that does nothing.
  if (!tenant.email) {
    return c.json(ok({ email: null, verified: true, source: 'none' }));
  }

  const pending = await c.env.CONTROL_DB.prepare(
    'SELECT email_verified FROM pending_owners WHERE tenant_id = ?'
  ).bind(tenant.id).first<{ email_verified: number }>();

  // org_users is authoritative when a row exists there; pending_owners is the fallback.
  try {
    const res = await c.env.CONTENT_WORKER.fetch(
      `http://internal/internal/${encodeURIComponent(slug)}/email-verification?email=${encodeURIComponent(tenant.email)}`,
      { headers: internalHeaders(c.env) }
    );
    if (res.ok) {
      const body = await res.json() as { ok: boolean; data?: { found: boolean; verified: boolean } };
      if (body.data?.found) {
        return c.json(ok({ email: tenant.email, verified: body.data.verified, source: 'org_users' }));
      }
    }
  } catch (e) {
    console.error(`email-verification read failed for ${slug}:`, e);
  }

  if (pending) {
    return c.json(ok({ email: tenant.email, verified: !!pending.email_verified, source: 'pending_owners' }));
  }
  // Neither store has a row. Not an error — an active tenant's owner row is created lazily
  // by the content worker's backfill on first write — but we cannot claim a state.
  return c.json(ok({ email: tenant.email, verified: null, source: 'unknown' }));
});

tenantsRouter.post('/:slug/verify-email', requireSuperadmin, async (c) => {
  const slug = c.req.param('slug')!;
  const tenant = await ownerEmailFor(c.env, slug);
  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);
  if (!tenant.email) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Tenant has no email address to verify'), 400);
  }

  let changed = 0;

  // org_users, via the content worker (the admin worker has no per-tenant D1 binding).
  try {
    const res = await c.env.CONTENT_WORKER.fetch(
      new Request(`http://internal/internal/${encodeURIComponent(slug)}/set-email-verified`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...internalHeaders(c.env) },
        body: JSON.stringify({ email: tenant.email }),
      })
    );
    if (res.ok) {
      const body = await res.json() as { ok: boolean; data?: { changes: number } };
      changed += body.data?.changes ?? 0;
    } else {
      console.error(`set-email-verified returned HTTP ${res.status} for ${slug}`);
    }
  } catch (e) {
    // A tenant that was never provisioned has no D1 to bind — expected for pending, and
    // the pending_owners write below is the one that matters there.
    console.error(`set-email-verified failed for ${slug}:`, e);
  }

  // pending_owners, on CONTROL_DB.
  try {
    const res = await c.env.CONTROL_DB.prepare(
      'UPDATE pending_owners SET email_verified = 1 WHERE tenant_id = ?'
    ).bind(tenant.id).run();
    changed += res.meta.changes;
  } catch (e) {
    console.error(`pending_owners verify failed for ${slug}:`, e);
  }

  if (changed === 0) {
    // Nothing was updated in either store, so the publisher is still blocked. Reporting
    // success here would leave the superadmin believing the problem was fixed.
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'No owner record could be updated. The tenant may not be provisioned yet.'), 500);
  }

  await c.env.CONTROL_DB.prepare(
    'INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)'
  ).bind(
    crypto.randomUUID(), tenant.id, 'tenant.email_manually_verified', c.var.adminId,
    JSON.stringify({ email: tenant.email, rows: changed })
  ).run().catch(e => console.error('Failed to write audit log for manual verify', e));

  // A tenant sitting at 'pending' is held by the signup verification gate; clearing the flag
  // by hand must also release it, or the publisher is verified but still has no workspace.
  // Mirrors the /verify-email/confirm path in the auth worker.
  //
  // The status transition doubles as the concurrency claim. `tenant.status` was read before
  // the verification writes above, so it is already stale by here — two overlapping requests
  // (a double-clicked button) would both have seen 'pending' and both dispatched a GitHub
  // Actions run against the same slug. The conditional UPDATE is the serialization point:
  // D1 applies the two statements in some order and only the first matches status='pending',
  // so exactly one caller sees changes > 0 and only that one dispatches. It also performs the
  // 'pending' -> 'provisioning' move the reprovision endpoint already does, which the earlier
  // version omitted — leaving the portal on a status that no longer reflected reality.
  let provisioning = false;
  const claim = await c.env.CONTROL_DB.prepare(
    "UPDATE tenants SET status = 'provisioning', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
  ).bind(tenant.id).run().catch(e => {
    console.error(`Failed to claim provisioning for ${slug}:`, e);
    return null;
  });

  if (claim && claim.meta.changes > 0) {
    provisioning = true;
    c.executionCtx.waitUntil((async () => {
      try {
        const res = await c.env.PROVISION_WORKER.fetch(new Request('http://provision/api/provision/trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug: tenant.slug })
        }));
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (e) {
        console.error(`Provision trigger failed after manual verify for ${slug}:`, e);
        // Rolls back the claim above, so status must be 'provisioning' here — not 'pending',
        // which is what this guard checked before the claim existed and would never match now.
        await c.env.CONTROL_DB.prepare(
          "UPDATE tenants SET status = 'provision_failed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'provisioning'"
        ).bind(tenant.id).run().catch(e => console.error('Failed to mark provision_failed', e));
      }
    })());
  }

  return c.json(ok({ verified: true, email: tenant.email, rows: changed, provisioning }));
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

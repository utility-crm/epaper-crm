import { Hono } from 'hono';
import { Env, orgUserAuth } from './middleware';
import { ok, err, ErrorCode, OrgUserJwtPayload, TenantRow, PendingOwnerRow, OrgUserRow } from '@epaper/types';
import { signJwt } from './jwt';

export const orgAuthRouter = new Hono<{ Bindings: Env; Variables: { tenantId: string; tenantSlug: string; orgRole: string } }>();

const encoder = new TextEncoder();

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']);
  const derivedBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, 256);
  const derivedHex = Array.from(new Uint8Array(derivedBits)).map(b => b.toString(16).padStart(2, '0')).join('');
  return derivedHex === hashHex;
}

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
  const { orgName, name, email, password, plan = 'community' } = body;
  
  if (!orgName || !name || !email || !password || password.length < 8) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid input'), 400);
  }
  
  if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Password must contain uppercase and digit'), 400);
  }
  
  const existing = await c.env.CONTROL_DB.prepare('SELECT id, status, slug FROM tenants WHERE email = ?').bind(email).first<{id: string, status: string, slug: string}>();
  if (existing) {
    if (existing.status === 'active' || existing.status === 'suspended') {
      return c.json(err(ErrorCode.CONFLICT, 'Account already exists. Please login.'), 409);
    } else if (existing.status === 'provisioning') {
      return c.json(err(ErrorCode.CONFLICT, 'Provisioning is currently in progress. Please wait a moment.'), 409);
    } else {
      // It is pending, provision_failed, deleting, or deleted.
      // We can safely delete the old record and allow them to sign up again for a clean slate.
      await c.env.CONTROL_DB.prepare('DELETE FROM tenants WHERE id = ?').bind(existing.id).run();
    }
  }
  
  const tenantId = crypto.randomUUID();
  const slugBase = slugify(orgName).slice(0, 32);
  const slug = `${slugBase}-${crypto.randomUUID().slice(0, 4)}`;
  const ownerId = crypto.randomUUID();
  const hash = await hashPassword(password);
  
  await c.env.CONTROL_DB.batch([
    c.env.CONTROL_DB.prepare(
      'INSERT INTO tenants (id, slug, name, email, status, plan) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(tenantId, slug, orgName, email, 'pending', plan),
    c.env.CONTROL_DB.prepare(
      'INSERT INTO pending_owners (id, tenant_id, name, password_hash) VALUES (?, ?, ?, ?)'
    ).bind(ownerId, tenantId, name, hash),
    c.env.CONTROL_DB.prepare(
      'INSERT INTO audit_log (id, tenant_id, action, performed_by, details) VALUES (?, ?, ?, ?, ?)'
    ).bind(crypto.randomUUID(), tenantId, 'tenant.created', 'system', JSON.stringify({ slug, email }))
  ]);
  
  c.executionCtx.waitUntil(
    c.env.PROVISION_WORKER.fetch(new Request('http://provision/api/provision/trigger', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug })
    })).catch(e => console.error('Provision trigger failed', e))
  );
  
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

  // Check pending_owners first (covers pending + provisioning states)
  const owner = await c.env.CONTROL_DB.prepare(
    'SELECT id, password_hash FROM pending_owners WHERE tenant_id = ?'
  ).bind(tenant.id).first<Pick<PendingOwnerRow, 'id' | 'password_hash'>>();
  
  if (owner) {
    userId = owner.id;
    valid = await verifyPassword(password, owner.password_hash);
  } else if (tenant.status === 'active') {
    // Active tenant: verify against the tenant's own D1 org_users table
    // We call the content worker's internal user-lookup endpoint via service binding
    try {
      const res = await c.env.CONTENT_WORKER.fetch(
        new Request(`http://content/internal/${tenant.slug}/verify-owner`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        })
      );
      if (res.ok) {
        const data = await res.json() as { ok: boolean; data?: { valid: boolean; role: string; userId: string } };
        if (data.ok && data.data?.valid) {
          valid = true;
          userId = data.data.userId;
          role = (data.data.role as OrgUserJwtPayload['role']) ?? 'owner';
        }
      }
    } catch {
      // Content worker unavailable — fall through to 401
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

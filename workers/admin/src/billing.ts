import { Hono } from 'hono';
import { Env, adminAuth } from './middleware';
import { ok, err, ErrorCode } from '@epaper/types';

export const billingRouter = new Hono<{ Bindings: Env; Variables: { adminId: string; adminRole: string } }>();

const requireSuperadmin = async (c: any, next: any) => {
  if (c.var.adminRole !== 'superadmin') {
    return c.json(err(ErrorCode.FORBIDDEN, 'Requires superadmin role'), 403);
  }
  await next();
};

billingRouter.use('*', adminAuth, requireSuperadmin);

billingRouter.get('/platform/plans', async (c) => {
  const req = new Request('http://billing/api/billing/platform/plans', {
    method: 'GET',
    headers: c.req.raw.headers
  });
  return c.env.BILLING_PLATFORM_WORKER.fetch(req);
});

billingRouter.get('/platform/:slug/status', async (c) => {
  const slug = c.req.param('slug');
  const req = new Request(`http://billing/api/billing/platform/${slug}/status`, {
    method: 'GET',
    headers: c.req.raw.headers
  });
  return c.env.BILLING_PLATFORM_WORKER.fetch(req);
});

billingRouter.get('/platform/:slug/events', async (c) => {
  const slug = c.req.param('slug');
  const tenant = await c.env.CONTROL_DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(slug).first<{id: string}>();

  if (!tenant) return c.json(err(ErrorCode.NOT_FOUND, 'Tenant not found'), 404);

  const { results } = await c.env.CONTROL_DB.prepare(
    'SELECT * FROM platform_billing_events WHERE tenant_id = ? ORDER BY created_at DESC'
  ).bind(tenant.id).all();

  return c.json(ok(results));
});

// Superadmin refund queue (Publication → Platform), proxied to billing-platform.
billingRouter.get('/platform/refund-requests', async (c) => {
  const qs = new URL(c.req.url).search;
  const req = new Request(`http://billing/internal/billing/platform/refund-requests${qs}`, {
    method: 'GET',
    headers: c.req.raw.headers,
  });
  return c.env.BILLING_PLATFORM_WORKER.fetch(req);
});

// Superadmin approves/rejects a platform refund; stamp who processed it.
billingRouter.post('/platform/refund-requests/:id/process', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({}));
  const req = new Request(`http://billing/internal/billing/platform/refund-requests/${id}/process`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, processed_by: c.var.adminId }),
  });
  return c.env.BILLING_PLATFORM_WORKER.fetch(req);
});

// Superadmin email delivery monitoring (all refund lanes).
billingRouter.get('/platform/email-events', async (c) => {
  const qs = new URL(c.req.url).search;
  const req = new Request(`http://billing/internal/billing/platform/email-events${qs}`, {
    method: 'GET',
    headers: c.req.raw.headers,
  });
  return c.env.BILLING_PLATFORM_WORKER.fetch(req);
});

import { Hono } from 'hono';
import { Env, adminAuth } from './middleware';
import { requireSuperadmin } from './platform-config';
import { recordAudit } from './audit';
import { err, ErrorCode } from '@epaper/types';

/**
 * Superadmin manual-subscription control. Thin proxy: all validation, date parsing
 * and row logic lives in billing-tenant's admin-grants.ts, which is also what the
 * publisher portal calls — so a grant made here and one made there are the same row.
 * This worker has no tenant D1 bindings, hence the service binding.
 */
export const subscriptionsRouter = new Hono<{ Bindings: Env; Variables: { adminId: string; adminRole: string } }>();

subscriptionsRouter.use('/*', adminAuth, requireSuperadmin);

async function proxy(
  c: any, method: 'POST' | 'PATCH', path: string, action: string,
) {
  if (!c.env.INTERNAL_SECRET) {
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'INTERNAL_SECRET not configured'), 500);
  }
  const slug = c.req.param('slug');
  const body = await c.req.json().catch(() => ({}));
  const grantedBy = `admin:${c.var.adminId}`;

  const res = await c.env.BILLING_TENANT.fetch(new Request(`http://billing-tenant${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': c.env.INTERNAL_SECRET },
    body: JSON.stringify({ ...body, granted_by: grantedBy }),
  }));
  const text = await res.text();

  if (res.ok) {
    // tenant_id, not slug — audit_log joins on tenants.id.
    const t = await (c.env.CONTROL_DB as D1Database).prepare('SELECT id FROM tenants WHERE slug = ?')
      .bind(slug).first<{ id: string }>();
    await recordAudit(c.env.CONTROL_DB, grantedBy, action, JSON.stringify({ slug, ...body }), t?.id ?? null);
  }
  // Pass the upstream body through verbatim: it is already the {ok,...}/{error,...}
  // envelope this worker uses, and re-wrapping would hide billing-tenant's messages.
  return new Response(text, { status: res.status, headers: { 'Content-Type': 'application/json' } });
}

subscriptionsRouter.post('/:slug', (c) =>
  proxy(c, 'POST', `/api/billing/tenant/internal/${c.req.param('slug')}/subscriptions`, 'subscription.manual_grant'));

subscriptionsRouter.patch('/:slug/:id', (c) =>
  proxy(c, 'PATCH', `/api/billing/tenant/internal/${c.req.param('slug')}/subscriptions/${c.req.param('id')}`, 'subscription.manual_patch'));

// Read-only reader lookup by email — not audited, and no body to forward, so it does
// not go through proxy().
subscriptionsRouter.get('/:slug/reader-lookup', async (c) => {
  if (!c.env.INTERNAL_SECRET) {
    return c.json(err(ErrorCode.INTERNAL_ERROR, 'INTERNAL_SECRET not configured'), 500);
  }
  const q = new URLSearchParams({ email: c.req.query('email') ?? '' });
  const res = await c.env.BILLING_TENANT.fetch(new Request(
    `http://billing-tenant/api/billing/tenant/internal/${c.req.param('slug')}/reader-lookup?${q}`,
    { headers: { 'X-Internal-Secret': c.env.INTERNAL_SECRET } },
  ));
  return new Response(await res.text(), { status: res.status, headers: { 'Content-Type': 'application/json' } });
});

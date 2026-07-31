import { Hono } from 'hono';
import { Env } from './middleware';
import { orgAuthRouter } from './org-auth';
import { tenantsRouter } from './tenants';
import { auditRouter } from './audit';
import { domainRouter } from './domain';
import { tiersRouter } from './tiers';
import { billingRouter } from './billing';
import { platformConfigRouter } from './platform-config';
import { subscriptionsRouter } from './subscriptions';
import { err, ErrorCode, ok } from '@epaper/types';

const app = new Hono<{ Bindings: Env }>();

// Auth/credential endpoints now live in the dedicated epaper-auth worker.
// Admin retains only the provisioning-lifecycle endpoints under /api/auth
// (provision-status, reprovision, verify-provisioning) via orgAuthRouter.
app.route('/api/auth', orgAuthRouter);
app.route('/api/tenants', tenantsRouter);
app.route('/api/audit', auditRouter);
app.route('/api/domain', domainRouter);
app.route('/api/tiers', tiersRouter);
app.route('/api/admin/billing', billingRouter);
app.route('/api/admin/platform-config', platformConfigRouter);
app.route('/api/admin/subscriptions', subscriptionsRouter);

app.get('/health', (c) => c.json(ok({ status: 'ok', worker: 'admin' })));

app.notFound((c) => {
  return c.json(err(ErrorCode.NOT_FOUND, 'Not found'), 404);
});

export default {
  fetch: app.fetch,
  async scheduled(event: any, env: Env, ctx: ExecutionContext) {
    // Deprovisioning queue: sweep for pending_deletion tenants
    try {
      const pending = await env.CONTROL_DB.prepare(
        'SELECT slug FROM tenants WHERE status = ? LIMIT 10'
      ).bind('pending_deletion').all<{slug: string}>();
      
      if (pending.results && pending.results.length > 0) {
        for (const tenant of pending.results) {
          // Mark as deleting so we don't trigger it again
          await env.CONTROL_DB.prepare(
            'UPDATE tenants SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
          ).bind('deleting', tenant.slug).run();

          // Cancel the platform Razorpay subscription so the org stops being billed.
          // (Reader subscriptions live in the tenant DB, which is destroyed by deprovision.)
          await env.BILLING_PLATFORM_WORKER.fetch(new Request(`http://billing/internal/billing/platform/${tenant.slug}/subscription`, {
            method: 'DELETE'
          })).catch(e => console.error(`Failed to cancel platform subscription for ${tenant.slug}`, e));

          // Trigger deprovision workflow
          await env.PROVISION_WORKER.fetch(new Request('http://provision/api/provision/deprovision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slug: tenant.slug })
          })).catch(e => console.error(`Failed to trigger deprovision for ${tenant.slug}`, e));
        }
      }
    } catch (e) {
      console.error('Scheduled deprovision sweep failed', e);
    }
  }
};

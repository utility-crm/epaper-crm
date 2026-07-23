import { Hono } from 'hono';
import { SupportEnv } from '../types.js';
import { getOrgStaff, mintWidgetToken } from '../auth.js';

// Issues the signed widget token that the embed snippet carries. Org-authenticated:
// only a logged-in staff member of a tenant can mint a token scoped to that tenant.
// The public chat endpoint then trusts the token's tenant_id instead of client input.
export const widgetTokenRouter = new Hono<{ Bindings: SupportEnv }>();

widgetTokenRouter.post('/', async (c) => {
  const staff = await getOrgStaff(c, c.env);
  if (!staff) return c.json({ success: false, error: 'Unauthorized' }, 401);

  // Attach the tenant's verified custom domain to the token when one is registered.
  let customDomain: string | undefined;
  const resolved = await c.env.CONTROL_DB.prepare(
    'SELECT custom_domain FROM tenants WHERE slug = ? AND status = ?'
  )
    .bind(staff.tenantSlug, 'active')
    .first<{ custom_domain: string | null }>();
  if (resolved?.custom_domain) customDomain = resolved.custom_domain;

  const token = await mintWidgetToken(c.env, staff.tenantSlug, customDomain);

  const embedSnippet = `<script src="https://support.epaperspace.com/widget.js" data-support-token="${token}"></script>`;

  return c.json({ success: true, token, tenantId: staff.tenantSlug, customDomain, embedSnippet });
});

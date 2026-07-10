import { Hono } from 'hono';
import { Env, orgUserAuth } from './middleware';
import { ok, err, ErrorCode } from '@epaper/types';

export const domainRouter = new Hono<{ Bindings: Env; Variables: { tenantId: string; tenantSlug: string; orgRole: string } }>();

// Basic hostname validation: labels of letters/digits/hyphens, at least one dot, no scheme/path.
const HOST_RE = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

function normalizeHost(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
}

// Public: reader app maps its current Host header to a tenant slug. No auth.
domainRouter.get('/resolve', async (c) => {
  const host = normalizeHost(c.req.query('host') ?? '');
  if (!host) return c.json(err(ErrorCode.BAD_REQUEST, 'Missing host'), 400);
  const row = await c.env.CONTROL_DB.prepare(
    'SELECT slug FROM tenants WHERE custom_domain = ? AND status = ?'
  ).bind(host, 'active').first<{ slug: string }>();
  if (!row) return c.json(err(ErrorCode.NOT_FOUND, 'No publication for this domain'), 404);
  return c.json(ok({ slug: row.slug }));
});

domainRouter.use('/*', orgUserAuth);

// Tenant reads their current domain + verification state.
domainRouter.get('/', async (c) => {
  const row = await c.env.CONTROL_DB.prepare(
    'SELECT custom_domain, domain_verified FROM tenants WHERE slug = ?'
  ).bind(c.var.tenantSlug).first<{ custom_domain: string | null; domain_verified: number }>();
  return c.json(ok(row ?? { custom_domain: null, domain_verified: 0 }));
});

// Tenant sets/updates their custom domain. We store it, register it with
// Cloudflare Pages (epaper-reader project), then return setup instructions.
domainRouter.post('/', async (c) => {
  const body = await c.req.json<{ domain: string }>();
  const domain = normalizeHost(body.domain ?? '');
  if (!HOST_RE.test(domain)) return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid domain'), 400);

  const clash = await c.env.CONTROL_DB.prepare(
    'SELECT slug FROM tenants WHERE custom_domain = ? AND slug != ?'
  ).bind(domain, c.var.tenantSlug).first();
  if (clash) return c.json(err(ErrorCode.CONFLICT, 'Domain already in use'), 409);

  await c.env.CONTROL_DB.prepare(
    'UPDATE tenants SET custom_domain = ?, domain_verified = 0, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
  ).bind(domain, c.var.tenantSlug).run();

  // Auto-register domain on the Cloudflare Pages reader-redirect project
  const cfToken = (c.env as any).CF_API_TOKEN;
  const cfAccount = (c.env as any).CF_ACCOUNT_ID;
  if (cfToken && cfAccount) {
    try {
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/pages/projects/epaper-reader/domains`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${cfToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: domain }),
        }
      );
    } catch {
      // Non-fatal — tenant can still add manually
    }
  }

  return c.json(ok({
    custom_domain: domain,
    domain_verified: 0,
    cname_target: 'epaper-reader.pages.dev',
    instructions: `Create a CNAME record: ${domain} → epaper-reader.pages.dev`,
  }));
});


domainRouter.delete('/', async (c) => {
  await c.env.CONTROL_DB.prepare(
    'UPDATE tenants SET custom_domain = NULL, domain_verified = 0, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
  ).bind(c.var.tenantSlug).run();
  return c.json(ok({ removed: true }));
});

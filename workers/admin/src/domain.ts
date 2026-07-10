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
  return c.json(ok({
    custom_domain: row?.custom_domain ?? null,
    domain_verified: row?.domain_verified ?? 0,
    cname_target: 'epaper-reader.pages.dev'
  }));
});

// Tenant checks live DNS & SSL verification status of their custom domain.
domainRouter.post('/verify', async (c) => {
  const row = await c.env.CONTROL_DB.prepare(
    'SELECT custom_domain, domain_verified FROM tenants WHERE slug = ?'
  ).bind(c.var.tenantSlug).first<{ custom_domain: string | null; domain_verified: number }>();
  
  if (!row?.custom_domain) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'No custom domain set'), 400);
  }

  const domain = row.custom_domain;
  let verified = false;
  let details = '';

  // 1. Check DNS CNAME via Cloudflare DNS over HTTPS
  try {
    const dnsRes = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=CNAME`, {
      headers: { 'Accept': 'application/dns-json' }
    });
    if (dnsRes.ok) {
      const dnsJson = await dnsRes.json() as any;
      if (dnsJson.Answer && Array.isArray(dnsJson.Answer)) {
        for (const ans of dnsJson.Answer) {
          const data = (ans.data || '').toLowerCase();
          if (data.includes('pages.dev') || data.includes('epaper-reader')) {
            verified = true;
            details = `CNAME verified pointing to ${ans.data}`;
            break;
          }
        }
      }
    }
  } catch {
    // continue
  }

  // 2. Also check if HTTPS request to custom domain succeeds
  if (!verified) {
    try {
      const httpRes = await fetch(`https://${domain}/`, { method: 'HEAD', redirect: 'follow' });
      if (httpRes.ok || httpRes.status < 500) {
        verified = true;
        details = 'Domain is live and responding over HTTPS.';
      }
    } catch {
      // continue
    }
  }

  // 3. Also check Cloudflare Pages custom domain status
  const cfToken = (c.env as any).CF_API_TOKEN;
  const cfAccount = (c.env as any).CF_ACCOUNT_ID;
  if (cfToken && cfAccount && !verified) {
    try {
      const cfRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${cfAccount}/pages/projects/epaper-reader/domains/${domain}`,
        { headers: { 'Authorization': `Bearer ${cfToken}` } }
      );
      if (cfRes.ok) {
        const cfJson = await cfRes.json() as any;
        if (cfJson.result?.status === 'active') {
          verified = true;
          details = 'Cloudflare Pages reports domain as active with SSL.';
        }
      }
    } catch {
      // continue
    }
  }

  if (verified) {
    await c.env.CONTROL_DB.prepare(
      'UPDATE tenants SET domain_verified = 1, updated_at = CURRENT_TIMESTAMP WHERE slug = ?'
    ).bind(c.var.tenantSlug).run();
    return c.json(ok({
      verified: true,
      custom_domain: domain,
      domain_verified: 1,
      message: details || 'DNS is verified and active!'
    }));
  } else {
    return c.json(ok({
      verified: false,
      custom_domain: domain,
      domain_verified: 0,
      message: 'CNAME record has not propagated to epaper-reader.pages.dev yet. Please wait a few minutes and check again.'
    }));
  }
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

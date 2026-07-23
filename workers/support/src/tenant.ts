import { SupportEnv } from './types.js';

function normalizeHost(input: string): string {
  return input.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
}

// Map a request Origin/Referer/host to a verified tenant slug using the control DB.
// Mirrors admin domain '/resolve': only active tenants with a matching custom_domain.
// Returns null when the host is unknown — callers must reject rather than guess.
export async function resolveTenantFromHost(
  env: SupportEnv,
  hostOrOrigin: string | undefined
): Promise<{ slug: string; customDomain: string } | null> {
  const host = normalizeHost(hostOrOrigin ?? '');
  if (!host) return null;
  const row = await env.CONTROL_DB.prepare(
    'SELECT slug, custom_domain FROM tenants WHERE custom_domain = ? AND status = ?'
  )
    .bind(host, 'active')
    .first<{ slug: string; custom_domain: string }>();
  if (!row) return null;
  return { slug: row.slug, customDomain: row.custom_domain };
}

export { normalizeHost };

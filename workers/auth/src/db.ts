// Resolve a per-tenant D1 binding by slug. Bindings are injected into
// workers/auth/wrangler.jsonc at provision time by scripts/inject-binding.js
// (slug uppercased, `-` -> `_`, suffixed `_DB`) — mirrors content/billing-tenant.
export function getTenantDb(env: Record<string, unknown>, slug: string): D1Database {
  const normalized = slug.toUpperCase().replace(/-/g, '_');
  const bindingName = `${normalized}_DB`;
  const db = env[bindingName];
  if (!db) {
    throw new Error(`Database binding not found for slug: ${slug} (${bindingName})`);
  }
  return db as D1Database;
}

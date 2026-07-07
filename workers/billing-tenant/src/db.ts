export function getTenantDb(env: any, slug: string): D1Database {
  const normalized = slug.toUpperCase().replace(/-/g, '_');
  const bindingName = `${normalized}_DB`;
  const db = env[bindingName];
  if (!db) {
    throw new Error(`Database binding not found for slug: ${slug} (${bindingName})`);
  }
  return db as D1Database;
}

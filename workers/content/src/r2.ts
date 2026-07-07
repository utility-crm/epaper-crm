export function getTenantDb(env: Record<string, unknown>, slug: string): D1Database {
  const normalized = slug.toUpperCase().replace(/-/g, '_');
  const bindingName = `${normalized}_DB`;
  const db = env[bindingName];
  if (!db) throw new Error(`DB binding not found: ${bindingName}`);
  return db as D1Database;
}

export function getTenantBucket(env: Record<string, unknown>, slug: string): R2Bucket {
  const normalized = slug.toUpperCase().replace(/-/g, '_');
  const bindingName = `${normalized}_R2`;
  const bucket = env[bindingName];
  if (!bucket) throw new Error(`R2 binding not found: ${bindingName}`);
  return bucket as R2Bucket;
}

export function getTenantDb(env: any, slug: string): D1Database {
  const normalized = slug.toUpperCase().replace(/-/g, '_');
  const bindingName = `${normalized}_DB`;
  const db = env[bindingName];
  if (!db) {
    throw new Error(`Database binding not found for slug: ${slug} (${bindingName})`);
  }
  return db as D1Database;
}

export function getTenantBucket(env: any, slug: string): R2Bucket {
  const normalized = slug.toUpperCase().replace(/-/g, '_');
  const bindingName = `${normalized}_R2`;
  const bucket = env[bindingName];
  if (!bucket) {
    throw new Error(`Bucket binding not found for slug: ${slug} (${bindingName})`);
  }
  return bucket as R2Bucket;
}

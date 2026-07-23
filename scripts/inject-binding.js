import fs from 'node:fs';

const slug = process.argv[2];
const dbId = process.argv[3];

if (!slug || !dbId) {
  console.error("Usage: node inject-binding.js <slug> <dbId>");
  process.exit(1);
}

function inject(file, slug, dbId) {
  let content = fs.readFileSync(file, 'utf8');
  // Strip comments for simple parsing (only handles // comments on their own line for this script's scope)
  const jsonStr = content.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  let config = JSON.parse(jsonStr);
  
  const normalized = slug.toUpperCase().replace(/-/g, '_');
  
  if (config.d1_databases) {
    if (!config.d1_databases.find(b => b.binding === `${normalized}_DB`)) {
      config.d1_databases.push({
        binding: `${normalized}_DB`,
        database_name: `epaper-${slug}`,
        database_id: dbId
      });
    }
  }
  
  if (config.r2_buckets !== undefined) {
    if (!config.r2_buckets.find(b => b.binding === `${normalized}_R2`)) {
      config.r2_buckets.push({
        binding: `${normalized}_R2`,
        bucket_name: `epaper-${slug}`
      });
    }
  }
  
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
}

inject('workers/content/wrangler.jsonc', slug, dbId);
inject('workers/billing-tenant/wrangler.jsonc', slug, dbId);
inject('workers/auth/wrangler.jsonc', slug, dbId);

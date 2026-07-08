const fs = require('fs');

const slug = process.argv[2];

if (!slug) {
  console.error("Usage: node remove-binding.js <slug>");
  process.exit(1);
}

function remove(file, slug) {
  let content = fs.readFileSync(file, 'utf8');
  const jsonStr = content.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  let config = JSON.parse(jsonStr);
  
  const normalized = slug.toUpperCase().replace(/-/g, '_');
  
  if (config.d1_databases) {
    config.d1_databases = config.d1_databases.filter(b => b.binding !== `${normalized}_DB`);
  }
  
  if (config.r2_buckets !== undefined) {
    config.r2_buckets = config.r2_buckets.filter(b => b.binding !== `${normalized}_R2`);
  }
  
  fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
}

remove('workers/content/wrangler.jsonc', slug);
remove('workers/billing-tenant/wrangler.jsonc', slug);

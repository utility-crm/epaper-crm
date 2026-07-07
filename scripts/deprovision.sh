#!/bin/bash
set -e

SLUG=$1
if [[ ! "$SLUG" =~ ^[a-z0-9-]{3,44}$ ]]; then
  echo "Invalid slug format"
  exit 1
fi

echo "Deprovisioning DB and Bucket for $SLUG..."

# Delete R2 Objects
npx wrangler r2 object delete epaper-$SLUG --recursive || true

# Delete R2 Bucket
npx wrangler r2 bucket delete epaper-$SLUG || true

# Delete D1 Database
npx wrangler d1 delete epaper-$SLUG --skip-confirmation || true

# Remove bindings from wrangler.jsonc files
node -e "
const fs = require('fs');
function remove(file, slug) {
  let content = fs.readFileSync(file, 'utf8');
  const jsonStr = content.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  let config = JSON.parse(jsonStr);
  
  const normalized = slug.toUpperCase().replace(/-/g, '_');
  
  if (config.d1_databases) {
    config.d1_databases = config.d1_databases.filter(b => b.binding !== \`\${normalized}_DB\`);
  }
  
  if (config.r2_buckets !== undefined) {
    config.r2_buckets = config.r2_buckets.filter(b => b.binding !== \`\${normalized}_R2\`);
  }
  
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
}

remove('workers/content/wrangler.jsonc', '$SLUG');
remove('workers/billing-tenant/wrangler.jsonc', '$SLUG');
"

echo "Deprovisioning complete for $SLUG"

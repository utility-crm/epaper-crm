#!/bin/bash
set -e

SLUG=$1
if [[ ! "$SLUG" =~ ^[a-z0-9-]{3,44}$ ]]; then
  echo "Invalid slug format"
  exit 1
fi

echo "Provisioning DB and Bucket for $SLUG..."

# Create D1 Database or get existing ID
if DB_INFO=$(npx wrangler d1 info epaper-$SLUG --json 2>/dev/null); then
  DB_ID=$(echo "$DB_INFO" | jq -r .uuid)
  echo "Database already exists. ID: $DB_ID"
else
  D1_OUTPUT=$(npx wrangler d1 create epaper-$SLUG | grep database_id)
  DB_ID=$(echo $D1_OUTPUT | awk -F'"' '{print $4}')
fi

if [ -z "$DB_ID" ]; then
  echo "Failed to extract DB ID"
  exit 1
fi

echo "DB ID: $DB_ID"

# Create R2 Bucket (ignore error if already exists)
npx wrangler r2 bucket create epaper-$SLUG || echo "Bucket might already exist, continuing..."

# Inject bindings into wrangler.jsonc files
node -e "
const fs = require('fs');
function inject(file, slug, dbId) {
  let content = fs.readFileSync(file, 'utf8');
  // Strip comments for simple parsing (only handles // comments on their own line for this script's scope)
  const jsonStr = content.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  let config = JSON.parse(jsonStr);
  
  const normalized = slug.toUpperCase().replace(/-/g, '_');
  
  if (config.d1_databases) {
    if (!config.d1_databases.find(b => b.binding === \`\${normalized}_DB\`)) {
      config.d1_databases.push({
        binding: \`\${normalized}_DB\`,
        database_name: \`epaper-\${slug}\`,
        database_id: dbId
      });
    }
  }
  
  if (config.r2_buckets !== undefined) {
    if (!config.r2_buckets.find(b => b.binding === \`\${normalized}_R2\`)) {
      config.r2_buckets.push({
        binding: \`\${normalized}_R2\`,
        bucket_name: \`epaper-\${slug}\`
      });
    }
  }
  
  fs.writeFileSync(file, JSON.stringify(config, null, 2));
}

inject('workers/content/wrangler.jsonc', '$SLUG', '$DB_ID');
inject('workers/billing-tenant/wrangler.jsonc', '$SLUG', '$DB_ID');
"

echo "Provisioning complete for $SLUG"

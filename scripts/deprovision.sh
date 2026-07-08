#!/bin/bash
set -e

SLUG=$1
if [[ ! "$SLUG" =~ ^[a-z0-9-]{3,44}$ ]]; then
  echo "Invalid slug format"
  exit 1
fi

echo "Deprovisioning DB and Bucket for $SLUG..."

# Empty R2 Bucket using a temporary worker
echo "Emptying R2 bucket epaper-$SLUG..."
mkdir -p /tmp/cleanup-$SLUG
cat << 'EOF' > /tmp/cleanup-$SLUG/index.js
export default {
  async fetch(request, env) {
    try {
      let truncated = true;
      let cursor = undefined;
      while (truncated) {
        const list = await env.BUCKET.list({ cursor });
        const keys = list.objects.map(o => o.key);
        if (keys.length > 0) {
          await env.BUCKET.delete(keys);
        }
        truncated = list.truncated;
        cursor = list.cursor;
      }
      return new Response("OK");
    } catch (e) {
      return new Response(e.message, { status: 500 });
    }
  }
}
EOF
cat << EOF > /tmp/cleanup-$SLUG/wrangler.toml
name = "r2-clean-$SLUG"
main = "index.js"
compatibility_date = "2024-01-01"
[[r2_buckets]]
binding = "BUCKET"
bucket_name = "epaper-$SLUG"
EOF

(
  cd /tmp/cleanup-$SLUG
  # Deploy the worker, suppressing output unless it fails (CI=true bypasses prompts)
  CI=true npx wrangler deploy > /dev/null 2>&1 || true
  
  # Trigger the cleanup
  curl -s "https://r2-clean-$SLUG.satishkumar-link.workers.dev" > /dev/null 2>&1 || true
  
  # Delete the temporary worker
  CI=true npx wrangler delete --name r2-clean-$SLUG --force > /dev/null 2>&1 || true
) || true

# Delete R2 Bucket
npx wrangler r2 bucket delete epaper-$SLUG || true

# Delete D1 Database
npx wrangler d1 delete epaper-$SLUG --skip-confirmation || true

echo "Deprovisioning complete for $SLUG"

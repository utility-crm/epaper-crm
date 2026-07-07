#!/bin/bash
set -e

SLUG=$1

echo "Checking health for $SLUG..."

OUTPUT=$(npx wrangler d1 execute epaper-$SLUG --remote --command "SELECT name FROM sqlite_schema WHERE type='table'")

# Check if tables exist
TABLES=("org_users" "editions" "sections" "razorpay_config" "reader_subscriptions" "reader_billing_events")

for TABLE in "${TABLES[@]}"; do
  if ! echo "$OUTPUT" | grep -q "$TABLE"; then
    echo "Health check failed: Table $TABLE not found"
    exit 1
  fi
done

echo "Health check passed for $SLUG"
exit 0

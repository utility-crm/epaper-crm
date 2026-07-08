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

echo "db_id=$DB_ID" >> $GITHUB_OUTPUT
echo "Provisioning complete for $SLUG"

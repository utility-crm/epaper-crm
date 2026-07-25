#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

WRANGLER_JSONC="workers/auth/wrangler.jsonc"
MIGRATIONS_DIR="migrations/tenant"

DB_NAMES=$(node -e "
const fs = require('fs');
const txt = fs.readFileSync('$WRANGLER_JSONC', 'utf8').replace(/\/\/[^\n]*/g, '');
const cfg = JSON.parse(txt);
cfg.d1_databases
  .filter(d => d.binding !== 'CONTROL_DB')
  .forEach(d => console.log(d.database_name));
")

for DB in $DB_NAMES; do
  echo "=== $DB ==="

  npx wrangler d1 execute "$DB" --remote \
    --command "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP);" \
    > /dev/null

  for MIGRATION in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    NAME=$(basename "$MIGRATION")

    RESULT=$(npx wrangler d1 execute "$DB" --remote \
      --command "SELECT name FROM _migrations WHERE name='$NAME';" \
      --json 2>/dev/null || echo "")

    if echo "$RESULT" | grep -q "\"$NAME\""; then
      echo "  skip  $NAME"
      continue
    fi

    echo "  apply $NAME"
    npx wrangler d1 execute "$DB" --remote --file="$MIGRATION"
    npx wrangler d1 execute "$DB" --remote \
      --command "INSERT OR IGNORE INTO _migrations (name) VALUES ('$NAME');" \
      > /dev/null
    echo "  done  $NAME"
  done
done

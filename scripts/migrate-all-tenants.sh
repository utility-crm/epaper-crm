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

  # Schema-verified baseline: creates _migrations and records the migrations whose
  # schema objects already exist, so DBs migrated before the ledger existed are not
  # re-run through non-idempotent DDL. Idempotent, so it runs every time.
  npx wrangler d1 execute "$DB" --remote --file=scripts/baseline/tenant.sql > /dev/null

  for MIGRATION in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
    NAME=$(basename "$MIGRATION")

    # Skip legacy 0003 migrations, same as provisioning and the GitHub workflow do.
    case "$NAME" in
      *0003_*) echo "  skip  $NAME (legacy)"; continue ;;
    esac

    # Fail closed: only a successful query that returns no row means "not applied".
    # A network, auth, or SQL failure must abort, never fall through to re-applying a
    # non-idempotent migration.
    if ! RESULT=$(npx wrangler d1 execute "$DB" --remote \
      --command "SELECT name FROM _migrations WHERE name='$NAME';" \
      --json); then
      echo "  ERROR ledger lookup failed for $NAME on $DB — aborting" >&2
      exit 1
    fi

    if echo "$RESULT" | grep -q "\"$NAME\""; then
      echo "  skip  $NAME"
      continue
    fi

    echo "  apply $NAME"
    # Apply the schema change and its ledger insert in ONE wrangler call: D1 runs a
    # multi-statement file as a single transaction, so a crash can't leave the schema
    # applied but the ledger un-updated (which would re-apply a non-idempotent migration
    # next run). No explicit BEGIN/COMMIT is added, so files that manage their own
    # transactions still work.
    TMP=$(mktemp)
    trap 'rm -f "$TMP"' EXIT
    cat "$MIGRATION" > "$TMP"
    printf "\nINSERT OR IGNORE INTO _migrations (name) VALUES ('%s');\n" "$NAME" >> "$TMP"
    npx wrangler d1 execute "$DB" --remote --file="$TMP"
    rm -f "$TMP"
    echo "  done  $NAME"
  done
done

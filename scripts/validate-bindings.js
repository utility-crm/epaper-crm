/**
 * validate-bindings.js
 *
 * Ensures every per-tenant D1 binding injected by inject-binding.js is present
 * in ALL three workers that need it (content, billing-tenant, auth). A binding
 * present in one but absent from another means that worker will return errors
 * for that tenant at runtime — exactly the bug that caused the speaktheworld 401.
 *
 * Exit 0  → all bindings are consistent.
 * Exit 1  → one or more bindings are missing; prints a precise diff to stderr.
 *
 * Usage: node scripts/validate-bindings.js
 */

import fs from 'node:fs';

// The three wrangler configs that must stay in sync for tenant D1 bindings.
const WRANGLER_FILES = [
  'workers/content/wrangler.jsonc',
  'workers/billing-tenant/wrangler.jsonc',
  'workers/auth/wrangler.jsonc',
];

// Bindings that exist in every worker by design and are NOT tenant-specific.
const EXCLUDED_BINDINGS = new Set(['CONTROL_DB']);

/**
 * Parse a wrangler.jsonc file, stripping single-line `//` comments so
 * JSON.parse can handle it. Mirrors the same approach used in inject-binding.js.
 */
function parseWrangler(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const stripped = raw
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
  return JSON.parse(stripped);
}

/**
 * Extract the set of tenant _DB binding names from a parsed wrangler config.
 * Returns a Map of bindingName → database_id so mismatched IDs are also caught.
 */
function tenantDbBindings(config) {
  const bindings = new Map();
  for (const entry of config.d1_databases ?? []) {
    if (!EXCLUDED_BINDINGS.has(entry.binding) && entry.binding.endsWith('_DB')) {
      bindings.set(entry.binding, entry.database_id);
    }
  }
  return bindings;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const configs = WRANGLER_FILES.map((f) => {
  try {
    return { file: f, bindings: tenantDbBindings(parseWrangler(f)) };
  } catch (e) {
    console.error(`ERROR: Could not read/parse ${f}: ${e.message}`);
    process.exit(1);
  }
});

// Collect the union of all tenant binding names across all files.
const allBindings = new Set();
for (const { bindings } of configs) {
  for (const name of bindings.keys()) allBindings.add(name);
}

let failed = false;

for (const binding of [...allBindings].sort()) {
  const presentIn = configs.filter((c) => c.bindings.has(binding));
  const missingIn = configs.filter((c) => !c.bindings.has(binding));

  if (missingIn.length === 0) {
    // All good — check that database_id is consistent across workers.
    const ids = new Set(configs.map((c) => c.bindings.get(binding)));
    if (ids.size > 1) {
      console.error(`\n❌  BINDING ID MISMATCH: ${binding}`);
      for (const { file, bindings } of configs) {
        console.error(`     ${file}: ${bindings.get(binding)}`);
      }
      failed = true;
    }
    continue;
  }

  console.error(`\n❌  MISSING BINDING: ${binding}`);
  console.error(`   Present in:`);
  for (const { file } of presentIn) console.error(`     ✓  ${file}`);
  console.error(`   Missing from:`);
  for (const { file } of missingIn) console.error(`     ✗  ${file}`);
  console.error(
    `\n   Fix: run   node scripts/inject-binding.js <slug> <db-id>\n` +
    `   or manually add the binding block to the listed file(s).`
  );
  failed = true;
}

if (failed) {
  console.error('\nBinding validation FAILED. See above for details.');
  process.exit(1);
}

console.log(`✅  All ${allBindings.size} tenant DB binding(s) are consistent across all workers.`);

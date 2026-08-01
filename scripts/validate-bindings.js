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

// ── Coverage against the live tenant list (opt-in: --live) ───────────────────
//
// The checks above compare the three workers to each other, so a tenant absent from ALL of
// them is "consistent" and passes. That is not a hypothetical: a live active tenant had its
// D1 and R2 created but no binding anywhere, and every request touching its DB threw
// "binding not found" — surfacing as a swallowed verification email, not as an error.
//
// Off by default because it needs network + wrangler auth; CI can opt in.
if (process.argv.includes('--live')) {
  const { execFileSync } = await import('node:child_process');
  const norm = (slug) => slug.toUpperCase().replace(/-/g, '_');
  try {
    // Bounded: an unauthenticated wrangler prompts on stdin and would otherwise hang a CI
    // job forever. A timeout lands in the same catch as any other failure — skipped, not fatal.
    const raw = execFileSync('npx', ['wrangler', 'd1', 'list', '--json'], {
      encoding: 'utf8',
      timeout: 60_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const dbs = JSON.parse(raw.slice(raw.indexOf('[')));
    // Only per-tenant DBs: epaper-<slug>, excluding the control DB and unrelated databases.
    const unbound = dbs
      .map((d) => d.name)
      .filter((n) => n.startsWith('epaper-') && n !== 'epaper-control')
      .map((n) => ({ db: n, binding: `${norm(n.slice('epaper-'.length))}_DB` }))
      .filter(({ binding }) => !allBindings.has(binding));

    for (const { db, binding } of unbound) {
      console.error(`\n❌  UNBOUND TENANT DB: ${db} (expected binding ${binding})`);
      console.error(`   Present in: no worker at all — requests for this tenant will throw at runtime.`);
      console.error(`   Fix: node scripts/inject-binding.js ${db.slice('epaper-'.length)} <db-id>, then redeploy the workers.`);
      failed = true;
    }
  } catch (e) {
    console.error(`\n⚠️  --live check skipped: could not list D1 databases (${e.message})`);
  }
}

if (failed) {
  console.error('\nBinding validation FAILED. See above for details.');
  process.exit(1);
}

console.log(`✅  All ${allBindings.size} tenant DB binding(s) are consistent across all workers.`);

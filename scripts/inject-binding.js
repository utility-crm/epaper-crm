/**
 * Append a per-tenant D1/R2 binding to the three workers that need it.
 *
 * Edits the text in place rather than round-tripping through JSON.parse/stringify: these
 * are .jsonc files whose comments explain why each binding exists, and a stringify rewrite
 * silently deleted them (and reflowed unrelated arrays) on every provision.
 */

import fs from 'node:fs';

const slug = process.argv[2];
const dbId = process.argv[3];

if (!slug || !dbId) {
  console.error("Usage: node inject-binding.js <slug> <dbId>");
  process.exit(1);
}

function parseJsonc(content) {
  return JSON.parse(content.split('\n').filter(l => !l.trim().startsWith('//')).join('\n'));
}

/**
 * Insert `entry` (pre-rendered, 4-space indented) at the end of the top-level `key` array.
 *
 * The closing bracket is found by counting depth from the opening one, not by searching for
 * the next `\n  ]`: an already-empty array is written `"key": []` on one line and has no such
 * sequence at all, so the search ran on and matched a *later* array's bracket, quietly
 * appending the binding to the wrong section. Throws rather than returning null — a binding
 * that silently fails to land leaves a tenant whose D1 exists but which no worker can reach.
 */
function appendToArray(file, content, key, entry) {
  const start = content.indexOf(`"${key}": [`);
  if (start === -1) throw new Error(`${file}: no "${key}" array to append to`);
  const open = content.indexOf('[', start);
  let depth = 0;
  let close = -1;
  for (let i = open; i < content.length; i++) {
    if (content[i] === '[') depth++;
    else if (content[i] === ']' && --depth === 0) { close = i; break; }
  }
  if (close === -1) throw new Error(`${file}: "${key}" array is unterminated`);

  const head = content.slice(0, close).replace(/\s*$/, '');
  // No comma before the first element of a previously empty array.
  const sep = content.slice(open + 1, close).trim() === '' ? '' : ',';
  return `${head}${sep}\n${entry}\n  ${content.slice(close)}`;
}

function inject(file, slug, dbId) {
  let content = fs.readFileSync(file, 'utf8');
  const config = parseJsonc(content);
  const normalized = slug.toUpperCase().replace(/-/g, '_');

  if (config.d1_databases && !config.d1_databases.find(b => b.binding === `${normalized}_DB`)) {
    const entry = `    {\n      "binding": "${normalized}_DB",\n      "database_name": "epaper-${slug}",\n      "database_id": "${dbId}"\n    }`;
    content = appendToArray(file, content, 'd1_databases', entry);
  }

  if (config.r2_buckets !== undefined && !config.r2_buckets.find(b => b.binding === `${normalized}_R2`)) {
    const entry = `    {\n      "binding": "${normalized}_R2",\n      "bucket_name": "epaper-${slug}"\n    }`;
    content = appendToArray(file, content, 'r2_buckets', entry);
  }

  // Never write a file we can no longer parse — a corrupted wrangler config breaks deploys
  // for every tenant, not just this one.
  parseJsonc(content);
  fs.writeFileSync(file, content);
}

inject('workers/content/wrangler.jsonc', slug, dbId);
inject('workers/billing-tenant/wrangler.jsonc', slug, dbId);
inject('workers/auth/wrangler.jsonc', slug, dbId);

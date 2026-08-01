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
 * Insert `entry` (pre-rendered, 4-space indented) at the end of the top-level `key` array,
 * by finding that array's closing `\n  ]` and splicing a comma before it.
 */
function appendToArray(content, key, entry) {
  const start = content.indexOf(`"${key}": [`);
  if (start === -1) return null;
  const end = content.indexOf('\n  ]', start);
  if (end === -1) return null;
  return `${content.slice(0, end)},\n${entry}${content.slice(end)}`;
}

function inject(file, slug, dbId) {
  let content = fs.readFileSync(file, 'utf8');
  const config = parseJsonc(content);
  const normalized = slug.toUpperCase().replace(/-/g, '_');

  if (config.d1_databases && !config.d1_databases.find(b => b.binding === `${normalized}_DB`)) {
    const entry = `    {\n      "binding": "${normalized}_DB",\n      "database_name": "epaper-${slug}",\n      "database_id": "${dbId}"\n    }`;
    content = appendToArray(content, 'd1_databases', entry) ?? content;
  }

  if (config.r2_buckets !== undefined && !config.r2_buckets.find(b => b.binding === `${normalized}_R2`)) {
    const entry = `    {\n      "binding": "${normalized}_R2",\n      "bucket_name": "epaper-${slug}"\n    }`;
    content = appendToArray(content, 'r2_buckets', entry) ?? content;
  }

  // Never write a file we can no longer parse — a corrupted wrangler config breaks deploys
  // for every tenant, not just this one.
  parseJsonc(content);
  fs.writeFileSync(file, content);
}

inject('workers/content/wrangler.jsonc', slug, dbId);
inject('workers/billing-tenant/wrangler.jsonc', slug, dbId);
inject('workers/auth/wrangler.jsonc', slug, dbId);

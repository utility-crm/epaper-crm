// Replays migrations/tenant/*.sql exactly the way .github/workflows/apply-migrations.yml
// does — baseline first, then ledger-gated file-by-file, each file plus its ledger insert in
// one transaction — against the three states a real tenant DB is actually in. It exists
// because the run that motivated it went red in CI on live databases: epaper-test2-ffdd had
// 0013's reader_subscriptions columns from a runtime ALTER, no ledger row, and 0013's plain
// ADD COLUMN aborted the whole tenant. There is no way to try a baseline change safely
// against D1, so try it here.
//
// Run: node scripts/baseline/tenant-baseline.selfcheck.mjs
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const DIR = 'migrations/tenant';
const BASELINE = readFileSync('scripts/baseline/tenant.sql', 'utf8');
// Same ordering and same legacy skip as both workflow loops.
const FILES = readdirSync(DIR).filter((f) => f.endsWith('.sql') && !f.includes('0003_')).sort();

// One migration file + its ledger row, atomically: a file that fails must leave neither.
function applyFile(db, name) {
  db.exec('BEGIN');
  try {
    db.exec(readFileSync(`${DIR}/${name}`, 'utf8'));
    db.exec(`INSERT OR IGNORE INTO _migrations (name) VALUES ('${name}')`);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw new Error(`applying ${name}: ${e.message}`);
  }
}

// The workflow's per-tenant sequence. Returns the files it actually applied.
function migrate(db, upto = FILES.length) {
  db.exec(BASELINE);
  const applied = [];
  for (const name of FILES.slice(0, upto)) {
    const row = db.prepare('SELECT name FROM _migrations WHERE name = ?').get(name);
    if (row) continue;
    applyFile(db, name);
    applied.push(name);
  }
  return applied;
}

const hasColumn = (db, table, col) =>
  db.prepare('SELECT sql FROM sqlite_master WHERE type=? AND name=?').get('table', table).sql.includes(col);

function assertSchema(db, label) {
  for (const col of ['grant_type', 'granted_by', 'grant_note', 'renewal_notified_at', 'last_payment_id'])
    assert.ok(hasColumn(db, 'reader_subscriptions', col), `${label}: reader_subscriptions.${col} missing`);
  assert.ok(hasColumn(db, 'org_users', 'permissions'), `${label}: org_users.permissions missing`);
}

// 1. Fresh provision: every file applies in order, nothing collides.
{
  const db = new DatabaseSync(':memory:');
  const applied = migrate(db);
  assert.deepEqual(applied, FILES, 'fresh: every migration should apply exactly once');
  assertSchema(db, 'fresh');
  // Re-running the whole loop must be a no-op, not a second round of ALTERs.
  assert.deepEqual(migrate(db), [], 'fresh: re-run should apply nothing');
  db.close();
}

// 2. epaper-test2-ffdd: stopped before 0013, then billing's runtime patches added 0013's
//    reader_subscriptions columns and 0014's last_payment_id behind the ledger's back.
{
  const db = new DatabaseSync(':memory:');
  const upto = FILES.indexOf('0013_manual_grants.sql');
  migrate(db, upto);
  for (const sql of [
    "ALTER TABLE reader_subscriptions ADD COLUMN grant_type TEXT NOT NULL DEFAULT 'razorpay'",
    'ALTER TABLE reader_subscriptions ADD COLUMN granted_by TEXT',
    'ALTER TABLE reader_subscriptions ADD COLUMN grant_note TEXT',
    'ALTER TABLE reader_subscriptions ADD COLUMN renewal_notified_at DATETIME',
    'ALTER TABLE reader_subscriptions ADD COLUMN last_payment_id TEXT',
  ])
    db.exec(sql);

  const applied = migrate(db);
  assert.ok(!applied.includes('0013_manual_grants.sql'), 'runtime-patched: 0013 must be baselined, not re-applied');
  assert.ok(!applied.includes('0014_reader_sub_last_payment.sql'), 'runtime-patched: 0014 must be baselined');
  // The whole point of splitting 0015 out: this tenant skips 0013 but must still get the
  // column 0013 used to carry, because nothing patches permissions in at runtime.
  assert.ok(applied.includes('0015_org_users_permissions.sql'), 'runtime-patched: 0015 must still apply');
  assertSchema(db, 'runtime-patched');
  db.close();
}

// 3. The tenants that already applied 0013 back when it also added org_users.permissions.
{
  const db = new DatabaseSync(':memory:');
  const upto = FILES.indexOf('0015_org_users_permissions.sql');
  migrate(db, upto);
  db.exec('ALTER TABLE org_users ADD COLUMN permissions TEXT'); // what old 0013 did

  const applied = migrate(db);
  assert.deepEqual(applied, [], 'legacy-0013: 0015 must be baselined, not re-applied');
  assertSchema(db, 'legacy-0013');
  db.close();
}

console.log(`tenant baseline self-check: ok (${FILES.length} migrations, 3 tenant states)`);

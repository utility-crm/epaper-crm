-- One-time, schema-verified baseline of the _migrations ledger for a tenant database
-- (epaper-<slug>). Same reasoning as scripts/baseline/control.sql: existing tenants
-- were migrated before the ledger existed, so a ledger-only run would re-apply
-- non-idempotent ADD COLUMN statements and fail. A migration is recorded only when
-- the schema object it introduces is actually present; a fresh tenant records nothing.
--
-- Guards read sqlite_master only (its stored `sql` text is rewritten by ADD COLUMN
-- and RENAME TO), so no PRAGMA support is required from D1.
--
-- One standalone INSERT per migration, NOT one INSERT with UNION ALL branches: D1
-- rejects a compound SELECT of this size with "too many terms in compound SELECT",
-- well below sqlite's own 500-term default.
--
-- 0003_restructure_epapers.sql is deliberately NOT baselined. Its only schema effect
-- is CREATE TABLE IF NOT EXISTS epapers, which is a no-op on any database that ran
-- 0001_init.sql (that file already creates epapers), so no schema state distinguishes
-- "0003 ran" from "0003 never ran" and any guard here would be a guess. The apply
-- loops skip it as legacy regardless, so leaving it out of the ledger changes nothing
-- they do.
--
-- Idempotent: INSERT OR IGNORE plus per-migration existence checks. Safe to re-run.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO _migrations (name) SELECT '0001_init.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='editions');

INSERT OR IGNORE INTO _migrations (name) SELECT '0002_stats.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='tenant_stats');

INSERT OR IGNORE INTO _migrations (name) SELECT '0004_reader_subscriptions.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='readers')
    AND EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='plans');

INSERT OR IGNORE INTO _migrations (name) SELECT '0004_settings.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='tenant_settings');

INSERT OR IGNORE INTO _migrations (name) SELECT '0005_cover.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='epapers' AND sql LIKE '%cover_key%');

INSERT OR IGNORE INTO _migrations (name) SELECT '0006_default_paper.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='epapers' AND sql LIKE '%is_default_for_day%');

INSERT OR IGNORE INTO _migrations (name) SELECT '0008_add_plan_tax.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='plans' AND sql LIKE '%tax_percentage%');

INSERT OR IGNORE INTO _migrations (name) SELECT '0009_clickmasks.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='epaper_pages' AND sql LIKE '%clickmasks%');

INSERT OR IGNORE INTO _migrations (name) SELECT '0010_reader_cancel_refund.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='razorpay_config' AND sql LIKE '%process_refunds%')
    AND EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='reader_subscriptions' AND sql LIKE '%cancelled_at%');

INSERT OR IGNORE INTO _migrations (name) SELECT '0011_firebase_auth_support.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='readers' AND sql LIKE '%firebase_uid%')
    AND EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='org_users' AND sql LIKE '%firebase_uid%');

INSERT OR IGNORE INTO _migrations (name) SELECT '0012_auth_tokens.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='auth_tokens');

INSERT OR IGNORE INTO _migrations (name) SELECT '0012_signup_throttle.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='signup_throttle');

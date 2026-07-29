-- One-time, schema-verified baseline of the _migrations ledger for epaper-control.
--
-- Existing databases were migrated before the ledger existed, so their ledger is
-- empty and a ledger-only run would re-apply non-idempotent DDL (bare CREATE TABLE
-- / ADD COLUMN) and fail. This records a migration as applied ONLY when the schema
-- object it introduces is actually present, so nothing is marked complete on faith
-- and a fresh, empty database records nothing at all.
--
-- Guards read sqlite_master only (its stored `sql` text is rewritten by ADD COLUMN
-- and RENAME TO), so no PRAGMA support is required from D1.
--
-- One standalone INSERT per migration, NOT one INSERT with UNION ALL branches: D1
-- rejects a compound SELECT of this size with "too many terms in compound SELECT",
-- well below sqlite's own 500-term default.
--
-- Idempotent: INSERT OR IGNORE plus per-migration existence checks. Safe to re-run.
CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO _migrations (name) SELECT '0001_init.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='tenants');

INSERT OR IGNORE INTO _migrations (name) SELECT '0002_add_tiers.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='platform_tiers');

INSERT OR IGNORE INTO _migrations (name) SELECT '0002_custom_domains.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='tenants' AND sql LIKE '%custom_domain%');

INSERT OR IGNORE INTO _migrations (name) SELECT '0003_add_tier_pricing.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='platform_tiers' AND sql LIKE '%price_inr%');

INSERT OR IGNORE INTO _migrations (name) SELECT '0004_custom_limits.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='tenants' AND sql LIKE '%custom_storage_mb%');

INSERT OR IGNORE INTO _migrations (name) SELECT '0010_add_features_to_tiers.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='platform_tiers' AND sql LIKE '%features%');

INSERT OR IGNORE INTO _migrations (name) SELECT '0011_firebase_auth_support.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='pending_owners' AND sql LIKE '%firebase_uid%');

INSERT OR IGNORE INTO _migrations (name) SELECT '0012_auth_tokens.sql'
  WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='auth_tokens');

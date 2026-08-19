-- Migration 0015: org_users.permissions, moved out of 0013_manual_grants.sql.
--
-- 0013 shipped this ALTER next to four reader_subscriptions ALTERs that
-- ensureGrantColumns() (workers/billing-tenant/src/admin-grants.ts) also applies at runtime,
-- swallowing the duplicate-column error. So a tenant that served a billing request before
-- 0013 reached it has those four columns and no ledger row, and 0013's plain ALTER (SQLite
-- has no ADD COLUMN IF NOT EXISTS) aborts the whole migration run on it — epaper-test2-ffdd,
-- 2026-08-18. The fix is to baseline 0013 as applied there; nothing patches permissions in at
-- runtime, so it cannot ride along on a file that is now skipped.
--
-- ABAC: JSON array of permission strings, e.g. '["manage_users","grant_subs"]'.
-- NULL means "fall back to role" — an owner keeps everything, which is how every
-- existing row behaves. Only staff who need narrower rights get an explicit array.
-- Pending owners (control DB, pre-activation) have no column and are always owners.
ALTER TABLE org_users ADD COLUMN permissions TEXT;

-- Tenants that applied 0013 while it still carried this ALTER already have the column, so
-- scripts/baseline/tenant.sql records this migration as applied for them.

-- Migration 0014: declare reader_subscriptions.last_payment_id in the schema.
--
-- The column has existed in practice since reader refunds shipped, but only because
-- ensureBillingColumns() in workers/billing-tenant ALTERs it in at runtime and swallows the
-- duplicate-column error. No migration ever declared it, so a freshly provisioned tenant
-- had the column only after some billing request happened to run that patch first —
-- meanwhile /reader/verify and the subscription webhook both INSERT it, and the reader
-- refund-request route selects on it.
--
-- Last successful charge on the subscription: which payment a refund has to target.
ALTER TABLE reader_subscriptions ADD COLUMN last_payment_id TEXT;

-- SQLite has no ADD COLUMN IF NOT EXISTS, so this file cannot guard itself against the
-- tenants that already got the column from the runtime patch. scripts/baseline/tenant.sql
-- carries the matching schema-verified ledger entry for exactly that reason — it runs
-- before every apply loop in scripts/migrate-all-tenants.sh and marks this migration
-- already-applied wherever reader_subscriptions already mentions last_payment_id.

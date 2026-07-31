-- Migration 0013: manual (offline / cash / enterprise) subscription grants.
--
-- Until now the only way a reader_subscriptions row could exist was a verified
-- Razorpay payment, so a publisher taking cash at the counter had no way to record it
-- and a superadmin had no way to open access for an enterprise deal.
--
-- razorpay_sub_id is UNIQUE NOT NULL (0001_init) and cannot be relaxed without
-- rebuilding the table in every tenant DB, so manual rows carry a synthetic
-- 'manual:<uuid>' there instead. grant_type is what code branches on.

-- 'razorpay' | 'manual'. Existing rows are all Razorpay, hence the default.
ALTER TABLE reader_subscriptions ADD COLUMN grant_type TEXT NOT NULL DEFAULT 'razorpay';

-- Who opened this grant: 'admin:<id>' or 'org:<userId>'. NULL for Razorpay rows.
-- Cash access is an accountability question, not just an access one.
ALTER TABLE reader_subscriptions ADD COLUMN granted_by TEXT;

-- Free-form note from whoever granted it (receipt number, deal reference).
ALTER TABLE reader_subscriptions ADD COLUMN grant_note TEXT;

-- Set when the pre-expiry warning mail goes out; cleared on renewal. This column IS
-- the idempotency guard for the renewal cron — without it a half-hourly sweep would
-- mail the same reader every 30 minutes for three days.
ALTER TABLE reader_subscriptions ADD COLUMN renewal_notified_at DATETIME;

-- The expiry sweep and the renewal sweep both scan (status, current_end).
CREATE INDEX IF NOT EXISTS idx_reader_subs_status_end ON reader_subscriptions(status, current_end);

-- ABAC: JSON array of permission strings, e.g. '["manage_users","grant_subs"]'.
-- NULL means "fall back to role" — an owner keeps everything, which is how every
-- existing row behaves. Only staff who need narrower rights get an explicit array.
-- Pending owners (control DB, pre-activation) have no column and are always owners.
ALTER TABLE org_users ADD COLUMN permissions TEXT;

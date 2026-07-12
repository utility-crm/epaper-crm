-- Reader-subscription cancel/refund support.
-- process_refunds: when 1, cancelling a reader subscription revokes access immediately
-- (org issues a refund); when 0, the reader keeps access until current_end.
ALTER TABLE razorpay_config ADD COLUMN process_refunds INTEGER NOT NULL DEFAULT 0;

-- When the subscription was cancelled (null while active).
ALTER TABLE reader_subscriptions ADD COLUMN cancelled_at DATETIME;

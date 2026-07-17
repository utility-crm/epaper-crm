-- Upsert on the stable tier id so re-running preserves each tier's
-- razorpay_plan_id (which is populated separately via backfill). A prior
-- DELETE+INSERT wiped those links to NULL, disabling Subscribe buttons.
INSERT INTO platform_tiers (id, name, max_storage_mb, max_views_per_day, max_simultaneous_editions, max_papers_per_day, price_inr, tax_percentage, billing_cycle, features) VALUES
('tier_community', 'Free', 100, 1000, 1, 1, 0, 0, 'yearly', '["100MB Cloud Storage", "1,000 Views/Day", "Clickmask Editor Access", "Basic CDN", "Community Support"]'),
('tier_local', 'Starter', 10240, 10000, 3, 5, 4500, 18, 'yearly', '["Everything in Free", "10GB Cloud Storage", "10,000 Views/Day", "Custom Domain Mapping", "Standard Support"]'),
('tier_regional', 'Basic', 30720, 50000, 5, 15, 14250, 18, 'yearly', '["Everything in Starter", "Metered Paywall Integration", "Automated Article Clipping", "Priority Support"]'),
('tier_national', 'Pro', 61440, 250000, 10, 30, 22500, 18, 'yearly', '["Everything in Basic", "Multi-edition Management", "24/7 Phone & Email Support"]'),
('tier_international', 'Business', 102400, 500000, 25, 50, 36000, 18, 'yearly', '["Everything in Pro", "Unlimited Editors", "Dedicated Success Manager"]')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  max_storage_mb = excluded.max_storage_mb,
  max_views_per_day = excluded.max_views_per_day,
  max_simultaneous_editions = excluded.max_simultaneous_editions,
  max_papers_per_day = excluded.max_papers_per_day,
  price_inr = excluded.price_inr,
  tax_percentage = excluded.tax_percentage,
  billing_cycle = excluded.billing_cycle,
  features = excluded.features,
  updated_at = CURRENT_TIMESTAMP;
  -- razorpay_plan_id intentionally omitted: preserved across re-seeds.

-- Also migrate the existing tenants to their new plan names so the
-- tenant->tier join (LOWER(t.plan)=LOWER(p.name)) keeps matching.
-- Case-insensitive matches so the lowercase 'community' free-tier
-- sentinel written by org-auth/cancellation code is caught too.
UPDATE tenants SET plan = 'Free'       WHERE LOWER(plan) IN ('community', 'free');
UPDATE tenants SET plan = 'Starter'    WHERE LOWER(plan) IN ('local press', 'starter', 'local');
UPDATE tenants SET plan = 'Basic'      WHERE LOWER(plan) IN ('regional edition', 'basic', 'regional');
UPDATE tenants SET plan = 'Pro'        WHERE LOWER(plan) IN ('national daily', 'pro', 'national', 'growth');
UPDATE tenants SET plan = 'Business'   WHERE LOWER(plan) IN ('international edition', 'business', 'international');
UPDATE tenants SET plan = 'Enterprise' WHERE LOWER(plan) IN ('global syndicate', 'enterprise');

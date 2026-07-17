DELETE FROM platform_tiers;

INSERT INTO platform_tiers (id, name, max_storage_mb, max_views_per_day, max_simultaneous_editions, max_papers_per_day, price_inr, tax_percentage, billing_cycle, features) VALUES
('tier_community', 'Community', 100, 1000, 1, 1, 0, 0, 'yearly', '["100MB Cloud Storage", "1,000 Views/Day", "Clickmask Editor Access", "Basic CDN", "Community Support"]'),
('tier_local', 'Local Press', 10240, 10000, 3, 5, 4500, 18, 'yearly', '["Everything in Community", "10GB Cloud Storage", "10,000 Views/Day", "Custom Domain Mapping", "Standard Support"]'),
('tier_regional', 'Regional Edition', 30720, 50000, 5, 15, 14250, 18, 'yearly', '["Everything in Local Press", "Metered Paywall Integration", "Automated Article Clipping", "Priority Support"]'),
('tier_national', 'National Daily', 61440, 250000, 10, 30, 22500, 18, 'yearly', '["Everything in Regional Edition", "Multi-edition Management", "24/7 Phone & Email Support"]'),
('tier_international', 'International Edition', 102400, 500000, 25, 50, 36000, 18, 'yearly', '["Everything in National Daily", "Unlimited Editors", "Dedicated Success Manager"]');

-- Also migrate the existing tenants to their new plans so they don't break
UPDATE tenants SET plan = 'Community' WHERE plan = 'Free';
UPDATE tenants SET plan = 'National Daily' WHERE plan = 'growth';

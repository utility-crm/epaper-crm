DELETE FROM platform_tiers;

INSERT INTO platform_tiers (id, name, max_storage_mb, max_views_per_day, max_simultaneous_editions, max_papers_per_day, price_inr, tax_percentage, billing_cycle, features) VALUES
('tier_community', 'Community', 100, 1000, 1, 1, 0, 0, 'monthly', '["100MB Cloud Storage", "1,000 Views/Day", "Clickmask Editor Access", "Basic CDN", "Community Support"]'),
('tier_local', 'Local Press', 10240, 10000, 3, 5, 4800, 18, 'monthly', '["10GB Cloud Storage", "10,000 Views/Day", "Custom Domain Mapping", "Remove ePaperSpace Branding", "Standard Support"]'),
('tier_regional', 'Regional Edition', 30720, 50000, 5, 15, 15800, 18, 'monthly', '["30GB Cloud Storage", "50,000 Views/Day", "Metered Paywall Integration", "Automated Article Clipping", "Priority Support"]'),
('tier_national', 'National Daily', 61440, 250000, 10, 30, 25000, 18, 'monthly', '["60GB Cloud Storage", "250,000 Views/Day", "Multi-edition Management", "API Access", "24/7 Phone & Email Support"]');

-- Also migrate the existing tenants to their new plans so they don't break
UPDATE tenants SET plan = 'Community' WHERE plan = 'Free';
UPDATE tenants SET plan = 'National Daily' WHERE plan = 'growth';

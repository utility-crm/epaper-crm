ALTER TABLE platform_tiers ADD COLUMN price_inr INTEGER DEFAULT 0;
ALTER TABLE platform_tiers ADD COLUMN tax_percentage INTEGER DEFAULT 0;
ALTER TABLE platform_tiers ADD COLUMN billing_cycle TEXT DEFAULT 'monthly';

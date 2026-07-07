CREATE TABLE platform_tiers (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  max_storage_mb INTEGER NOT NULL,
  max_views_per_day INTEGER NOT NULL,
  max_simultaneous_editions INTEGER NOT NULL,
  max_papers_per_day INTEGER NOT NULL,
  razorpay_plan_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed default tiers
INSERT INTO platform_tiers (id, name, max_storage_mb, max_views_per_day, max_simultaneous_editions, max_papers_per_day, razorpay_plan_id)
VALUES 
  ('tier_starter', 'starter', 512, 1000, 1, 1, NULL),
  ('tier_growth', 'growth', 2048, 10000, 3, 5, NULL),
  ('tier_enterprise', 'enterprise', 10240, 100000, 10, 20, NULL);

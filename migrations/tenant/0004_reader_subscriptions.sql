-- Reader subscriptions, tiers/plans, metered paywall, reader accounts

-- Tenant-defined content tiers (e.g. "Daily", "Magazine").
-- An active subscription to a tier unlocks all premium papers of editions in that tier.
CREATE TABLE IF NOT EXISTS tiers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Subscription products readers buy. Priced per interval, optional promotional offer.
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  tier_id TEXT NOT NULL REFERENCES tiers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  interval TEXT NOT NULL DEFAULT 'monthly',      -- 'monthly' | '6month' | '12month'
  price_paise INTEGER NOT NULL,
  offer_pct INTEGER NOT NULL DEFAULT 0,          -- 0-100 discount
  offer_label TEXT,                              -- e.g. "Launch offer"
  active BOOLEAN NOT NULL DEFAULT 1,
  razorpay_plan_id TEXT,                         -- set once created in tenant's Razorpay
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Editions belong to a tier (nullable = untiered/free-only).
ALTER TABLE editions ADD COLUMN tier_id TEXT REFERENCES tiers(id) ON DELETE SET NULL;

-- Per-paper metered paywall.
-- free_page_count: 0 = fully premium, >= page_count = fully free, N = first N pages free.
ALTER TABLE epapers ADD COLUMN title TEXT;
ALTER TABLE epapers ADD COLUMN free_page_count INTEGER NOT NULL DEFAULT 0;

-- One row per split page (server-side split at upload; locked pages never leave the edge).
CREATE TABLE IF NOT EXISTS epaper_pages (
  id TEXT PRIMARY KEY,
  epaper_id TEXT NOT NULL REFERENCES epapers(id) ON DELETE CASCADE,
  page_no INTEGER NOT NULL,
  r2_key TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(epaper_id, page_no)
);

-- Reader accounts (per-tenant). Required only to unlock premium pages.
CREATE TABLE IF NOT EXISTS readers (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- reader_subscriptions already exists (0001). Attach it to a tier + plan.
ALTER TABLE reader_subscriptions ADD COLUMN tier_id TEXT REFERENCES tiers(id) ON DELETE SET NULL;
ALTER TABLE reader_subscriptions ADD COLUMN plan_id TEXT REFERENCES plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_plans_tier_id ON plans(tier_id);
CREATE INDEX IF NOT EXISTS idx_editions_tier_id ON editions(tier_id);
CREATE INDEX IF NOT EXISTS idx_epaper_pages_epaper_id ON epaper_pages(epaper_id);
CREATE INDEX IF NOT EXISTS idx_readers_email ON readers(email);
CREATE INDEX IF NOT EXISTS idx_reader_subscriptions_reader_id ON reader_subscriptions(reader_id);
CREATE INDEX IF NOT EXISTS idx_reader_subscriptions_tier_id ON reader_subscriptions(tier_id);

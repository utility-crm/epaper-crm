CREATE TABLE org_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE editions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  publish_date DATETIME NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  r2_key TEXT,
  page_count INTEGER,
  created_by TEXT NOT NULL REFERENCES org_users(id),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sections (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  page_start INTEGER NOT NULL,
  page_end INTEGER NOT NULL
);

CREATE TABLE razorpay_config (
  id INTEGER PRIMARY KEY CHECK(id=1),
  key_id TEXT NOT NULL,
  key_secret_enc TEXT NOT NULL,
  webhook_secret_enc TEXT,
  plan_ids TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reader_subscriptions (
  id TEXT PRIMARY KEY,
  reader_id TEXT NOT NULL,
  razorpay_sub_id TEXT UNIQUE NOT NULL,
  plan_type TEXT NOT NULL,
  status TEXT NOT NULL,
  current_start DATETIME NOT NULL,
  current_end DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reader_billing_events (
  id TEXT PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES reader_subscriptions(id),
  event_type TEXT NOT NULL,
  razorpay_event_id TEXT UNIQUE NOT NULL,
  amount_paise INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_editions_status ON editions(status);
CREATE INDEX idx_editions_publish_date ON editions(publish_date);
CREATE INDEX idx_reader_subscriptions_status ON reader_subscriptions(status);

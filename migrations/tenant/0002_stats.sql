CREATE TABLE IF NOT EXISTS tenant_stats (
  id INTEGER PRIMARY KEY CHECK(id=1),
  disk_usage_bytes INTEGER NOT NULL DEFAULT 0,
  pageviews INTEGER NOT NULL DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO tenant_stats (id, disk_usage_bytes, pageviews) VALUES (1, 0, 0);

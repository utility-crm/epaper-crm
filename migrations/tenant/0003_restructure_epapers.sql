-- Restructure Editions and Epapers

CREATE TABLE IF NOT EXISTS epapers (
  id TEXT PRIMARY KEY,
  edition_id TEXT NOT NULL REFERENCES editions(id) ON DELETE CASCADE,
  publish_date DATETIME NOT NULL,
  r2_key TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  is_free BOOLEAN NOT NULL DEFAULT 0,
  publish_type TEXT NOT NULL DEFAULT 'instant',
  scheduled_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Migrate existing data (turn each existing edition into a parent, and its data into a child epaper)
INSERT INTO epapers (id, edition_id, publish_date, r2_key, status)
SELECT lower(hex(randomblob(16))), id, publish_date, r2_key, status
FROM editions
WHERE publish_date IS NOT NULL;

-- Remove the old columns from editions (commented out to prevent errors on flattened new DBs)
DROP INDEX IF EXISTS idx_editions_publish_date;
-- ALTER TABLE editions DROP COLUMN publish_date;
-- ALTER TABLE editions DROP COLUMN r2_key;
-- ALTER TABLE editions DROP COLUMN page_count;

CREATE INDEX IF NOT EXISTS idx_epapers_status ON epapers(status);
CREATE INDEX IF NOT EXISTS idx_epapers_edition_id ON epapers(edition_id);

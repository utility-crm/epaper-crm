-- Tenant branding & theme settings
CREATE TABLE IF NOT EXISTS tenant_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  org_name TEXT,
  logo_url TEXT,
  theme_id TEXT NOT NULL DEFAULT 'modern',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Seed a default row so GET always returns something
INSERT OR IGNORE INTO tenant_settings (id) VALUES ('singleton');

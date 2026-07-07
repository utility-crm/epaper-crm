-- Tenant custom domains (routing MVP; TLS/cert automation deferred to Cloudflare for SaaS).
-- Reader hits their own domain -> gateway resolves Host -> tenant slug -> reader view.
ALTER TABLE tenants ADD COLUMN custom_domain TEXT;
ALTER TABLE tenants ADD COLUMN domain_verified INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_custom_domain ON tenants(custom_domain);

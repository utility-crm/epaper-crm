-- Migration 0013: superadmin SMS abuse controls.
--
-- Firebase sends the OTP client-side, so the platform cannot block an SMS at the
-- provider. What it can do is refuse to hand out the audit/billable record that a
-- send is gated on, which is where these two knobs are read.
--
-- platform_config was previously created only by runtime DDL (ensurePlatformConfig in
-- workers/admin/src/platform-config.ts). ADD COLUMN is not re-runnable, so the columns
-- need a real migration — and the CREATE below keeps this file standalone on a control
-- DB where the runtime path has never fired.
CREATE TABLE IF NOT EXISTS platform_config (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  sms_rate_usd REAL NOT NULL DEFAULT 0.10,
  usd_inr_fallback REAL NOT NULL DEFAULT 88.0,
  updated_by TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO platform_config (id) VALUES ('singleton');

-- Per-tenant daily ceiling on SMS sends. 50/day covers ordinary reader signup volume;
-- a tenant looping the endpoint hits it long before the bill matters.
ALTER TABLE platform_config ADD COLUMN sms_daily_cap INTEGER NOT NULL DEFAULT 50;

-- Platform-wide kill switch, for abuse that outruns the per-tenant cap.
ALTER TABLE platform_config ADD COLUMN sms_disabled INTEGER NOT NULL DEFAULT 0;

-- The cap counts today's sms rows per tenant; without this the count is a full scan of
-- audit_log on every OTP request.
CREATE INDEX IF NOT EXISTS idx_audit_sms_tenant_day ON audit_log(action, tenant_id, created_at);

-- Migration 0011 for Control DB: Firebase Auth Support for Pending Owners and Admins (Stage 1)

CREATE TABLE IF NOT EXISTS pending_owners_new (
  id TEXT PRIMARY KEY,
  tenant_id TEXT UNIQUE NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  password_hash TEXT,
  firebase_uid TEXT UNIQUE,
  phone_number TEXT UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT 0,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO pending_owners_new (id, tenant_id, name, password_hash, created_at)
SELECT id, tenant_id, name, password_hash, created_at FROM pending_owners;

DROP TABLE IF EXISTS pending_owners;
ALTER TABLE pending_owners_new RENAME TO pending_owners;

CREATE INDEX IF NOT EXISTS idx_pending_owners_firebase_uid ON pending_owners(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_pending_owners_phone_number ON pending_owners(phone_number);

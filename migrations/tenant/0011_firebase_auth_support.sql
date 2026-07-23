-- Migration 0011: Firebase Auth Support for Readers and Org Users (Stage 1 & Stage 2)

-- 1. Recreate readers table to support nullable email and password_hash + new auth columns
CREATE TABLE IF NOT EXISTS readers_new (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  name TEXT NOT NULL,
  firebase_uid TEXT UNIQUE,
  phone_number TEXT UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT 0,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO readers_new (id, email, password_hash, name, created_at, updated_at)
SELECT id, email, password_hash, name, created_at, updated_at FROM readers;

DROP TABLE IF EXISTS readers;
ALTER TABLE readers_new RENAME TO readers;

CREATE INDEX IF NOT EXISTS idx_readers_email ON readers(email);
CREATE INDEX IF NOT EXISTS idx_readers_firebase_uid ON readers(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_readers_phone_number ON readers(phone_number);

-- 2. Recreate org_users table to support nullable email and password_hash + new auth columns
CREATE TABLE IF NOT EXISTS org_users_new (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  password_hash TEXT,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'editor',
  firebase_uid TEXT UNIQUE,
  phone_number TEXT UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT 0,
  auth_provider TEXT NOT NULL DEFAULT 'local',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO org_users_new (id, email, password_hash, name, role, created_at, updated_at)
SELECT id, email, password_hash, name, role, created_at, updated_at FROM org_users;

DROP TABLE IF EXISTS org_users;
ALTER TABLE org_users_new RENAME TO org_users;

CREATE INDEX IF NOT EXISTS idx_org_users_email ON org_users(email);
CREATE INDEX IF NOT EXISTS idx_org_users_firebase_uid ON org_users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_org_users_phone_number ON org_users(phone_number);

-- Migration 0012: single-use auth-mail tokens (email verification, password reset).
--
-- The link carries a raw 256-bit code; only its SHA-256 is stored, so a database
-- dump yields no usable links. A token is redeemed by a single UPDATE ... RETURNING
-- that sets consumed_at, which makes a double click on the same link a no-op.
--
-- Same shape in the control DB (publishers, subject = login email) and in every
-- tenant DB (readers, subject = reader id) — see packages/auth-mail.

CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,            -- 'verify_email' | 'password_reset'
  subject TEXT NOT NULL,            -- publisher login email (control DB) / reader id (tenant DB)
  slug TEXT,                        -- publication the request came from
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Redemption looks the token up by hash + purpose; minting invalidates a subject's
-- outstanding tokens of the same purpose.
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_subject ON auth_tokens(purpose, subject);

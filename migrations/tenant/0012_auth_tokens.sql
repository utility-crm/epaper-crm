-- Migration 0012: single-use auth-mail tokens for readers (verification, password reset).
--
-- Identical shape to migrations/control/0012_auth_tokens.sql, but scoped to this
-- publication's own database: `subject` is a reader id, so a token minted for one
-- publication is meaningless in another. The link carries a raw 256-bit code and
-- only its SHA-256 is stored; redemption is a single UPDATE ... RETURNING that sets
-- consumed_at, so a link works exactly once. See packages/auth-mail.

CREATE TABLE IF NOT EXISTS auth_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,            -- 'verify_email' | 'password_reset'
  subject TEXT NOT NULL,            -- reader id
  slug TEXT,                        -- publication the request came from
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_subject ON auth_tokens(purpose, subject);

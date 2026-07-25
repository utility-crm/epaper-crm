-- Per-IP reader signup throttle. Caps verification-email sends per IP in a rolling
-- window so the public signup route can't relay branded mail to arbitrary addresses.
-- Schema + indexes live here (not created on the request path). Cleanup of expired
-- rows runs in the content worker's scheduled handler. The request path is limited to
-- a single atomic insert-if-under-limit statement.
CREATE TABLE IF NOT EXISTS signup_throttle (
  ip TEXT NOT NULL,
  ts INTEGER NOT NULL
);

-- Covers the per-IP window count (ip, ts).
CREATE INDEX IF NOT EXISTS idx_signup_throttle_ip_ts ON signup_throttle(ip, ts);
-- Covers scheduled cleanup by ts.
CREATE INDEX IF NOT EXISTS idx_signup_throttle_ts ON signup_throttle(ts);

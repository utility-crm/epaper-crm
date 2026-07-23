-- 0002_support_counters.sql
-- Atomic counter table for race-safe ticket numbering (replaces MAX()+1).

CREATE TABLE IF NOT EXISTS support_counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);

-- Seed the ticket counter at 1000 so the first allocated number is 1001,
-- preserving the previous numbering baseline.
INSERT INTO support_counters (name, value) VALUES ('ticket_number', 1000)
  ON CONFLICT(name) DO NOTHING;

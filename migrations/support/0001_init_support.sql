-- 0001_init_support.sql
-- Isolated SQLite/D1 schema for support.epaperspace.com ticketing and AI RAG service

CREATE TABLE IF NOT EXISTS organization_memories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content_chunk TEXT NOT NULL,
  vector_id TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  ticket_number INTEGER UNIQUE,
  tenant_id TEXT NOT NULL,
  custom_domain TEXT,
  user_email TEXT NOT NULL,
  user_name TEXT,
  subject TEXT NOT NULL,
  category TEXT DEFAULT 'support', -- 'support', 'refund', 'billing', 'bug'
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'
  priority TEXT NOT NULL DEFAULT 'medium', -- 'low', 'medium', 'high', 'urgent'
  reply_token TEXT NOT NULL UNIQUE,
  refund_eligible BOOLEAN DEFAULT NULL,
  refund_eligibility_notes TEXT,
  ai_summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_type TEXT NOT NULL, -- 'customer', 'agent', 'ai_assistant'
  sender_email TEXT NOT NULL,
  sender_name TEXT,
  message_body TEXT NOT NULL,
  is_internal_note BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_org_memories_tenant_id ON organization_memories(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant_id ON tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_reply_token ON tickets(reply_token);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket_id ON ticket_messages(ticket_id);

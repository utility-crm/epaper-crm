export interface SupportEnv {
  SUPPORT_DB: D1Database;
  // Control DB (epaper-control) — read-only source of truth for custom_domain -> tenant slug.
  CONTROL_DB: D1Database;
  AI: any;
  SUPPORT_KNOWLEDGE_INDEX: any;
  // Secrets (wrangler secret put):
  SUPPORT_WIDGET_SECRET: string; // HMAC key for signed widget tokens
  ORG_JWT_SECRET: string;        // shared with admin/billing — verifies tenant-portal staff JWTs
  BILLING_WORKER?: Fetcher;      // service binding to billing worker for refund verification
  REFUND_API_KEY?: string;       // shared secret for the billing internal refund endpoint
  RESEND_API_KEY?: string;
  SUPPORT_FROM_EMAIL?: string;
  // Optional external SMTP/webhook dispatch key used by support-mailer as an alternative to Resend.
  SUPPORT_SMTP_API_KEY?: string;
  // Base URL of the billing service for server-to-server refund verification (refund-verifier).
  BILLING_API_URL?: string;
  // Comma-separated allowlist of origins permitted to call authed routes (agent desk, portal).
  ALLOWED_ORIGIN?: string;
}

export interface TicketRecord {
  id: string;
  ticket_number: number;
  tenant_id: string;
  custom_domain: string | null;
  user_email: string;
  user_name: string | null;
  subject: string;
  category: 'support' | 'refund' | 'billing' | 'bug';
  status: 'open' | 'in_progress' | 'waiting_on_customer' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reply_token: string;
  refund_eligible: number | null;
  refund_eligibility_notes: string | null;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketMessageRecord {
  id: string;
  ticket_id: string;
  sender_type: 'customer' | 'agent' | 'ai_assistant';
  sender_email: string;
  sender_name: string | null;
  message_body: string;
  is_internal_note: number;
  created_at: string;
}

export interface OrganizationMemoryRecord {
  id: string;
  tenant_id: string;
  title: string;
  content_chunk: string;
  vector_id: string;
  created_at: string;
  updated_at: string;
}

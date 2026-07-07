export type ApiSuccess<T> = { ok: true; data: T };
export type ApiError = { ok: false; error: { code: string; message: string } };
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

export function err(code: string, message: string): ApiError {
  return { ok: false, error: { code, message } };
}

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_AUDIENCE: 'INVALID_AUDIENCE',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  SLUG_NOT_FOUND: 'SLUG_NOT_FOUND',
  BAD_REQUEST: 'BAD_REQUEST',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type AdminRole = 'superadmin' | 'admin';

export interface AdminRow {
  id: string;
  email: string;
  password_hash: string;
  role: AdminRole;
  is_setup_done: number;
  created_at: string;
  updated_at: string;
}

export type TenantStatus = 'pending' | 'provisioning' | 'active' | 'suspended' | 'deleting' | 'deleted';
export type TenantPlan = 'starter' | 'growth' | 'enterprise';

export interface TenantRow {
  id: string;
  slug: string;
  name: string;
  email: string;
  plan: TenantPlan;
  status: TenantStatus;
  d1_id: string | null;
  r2_bucket: string | null;
  provision_run_id: string | null;
  razorpay_plan_id: string | null;
  razorpay_sub_id: string | null;
  custom_domain: string | null;
  domain_verified: number;
  created_at: string;
  updated_at: string;
}

export interface PendingOwnerRow {
  id: string;
  tenant_id: string;
  name: string;
  password_hash: string;
  created_at: string;
}

export interface PlatformBillingEventRow {
  id: string;
  tenant_id: string;
  event_type: string;
  razorpay_event_id: string;
  amount_paise: number;
  payload: string;
  created_at: string;
}

export interface AuditLogRow {
  id: string;
  tenant_id: string | null;
  action: string;
  performed_by: string;
  details: string;
  created_at: string;
}

export type OrgUserRole = 'owner' | 'admin' | 'editor';

export interface OrgUserRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  role: OrgUserRole;
  created_at: string;
  updated_at: string;
}

export type EditionStatus = 'draft' | 'published' | 'archived';

export interface EditionRow {
  id: string;
  title: string;
  status: EditionStatus;
  tier_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type PublishType = 'instant' | 'scheduled';
export type EpaperStatus = 'draft' | 'published' | 'archived';

export interface EpaperRow {
  id: string;
  edition_id: string;
  title: string | null;
  publish_date: string;
  r2_key: string | null;
  status: EpaperStatus;
  is_free: number;
  publish_type: PublishType;
  scheduled_at: string | null;
  page_count: number;
  free_page_count: number;
  created_at: string;
  updated_at: string;
}

export interface EpaperPageRow {
  id: string;
  epaper_id: string;
  page_no: number;
  r2_key: string;
  created_at: string;
}

export type SubscriptionInterval = 'monthly' | '6month' | '12month';

export interface TierRow {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanRow {
  id: string;
  tier_id: string;
  name: string;
  interval: SubscriptionInterval;
  price_paise: number;
  offer_pct: number;
  offer_label: string | null;
  active: number;
  razorpay_plan_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReaderRow {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface SectionRow {
  id: string;
  edition_id: string;
  name: string;
  page_start: number;
  page_end: number;
}

export interface RazorpayConfigRow {
  id: number;
  key_id: string;
  key_secret_enc: string;
  webhook_secret_enc: string | null;
  plan_ids: string | null;
  updated_at: string;
}

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'unpaid';

export interface ReaderSubscriptionRow {
  id: string;
  reader_id: string;
  razorpay_sub_id: string;
  plan_type: string;
  tier_id: string | null;
  plan_id: string | null;
  status: SubscriptionStatus;
  current_start: string;
  current_end: string;
  created_at: string;
  updated_at: string;
}

export interface ReaderBillingEventRow {
  id: string;
  subscription_id: string;
  event_type: string;
  razorpay_event_id: string;
  amount_paise: number;
  payload: string;
  created_at: string;
}

export interface AdminJwtPayload {
  aud: 'crm';
  sub: string;
  role: AdminRole;
  exp: number;
}

export interface OrgUserJwtPayload {
  aud: 'tenant-portal';
  sub: string;
  tenantSlug: string;
  role: OrgUserRole;
  userId: string;
  exp: number;
}

export interface ReaderJwtPayload {
  aud: 'reader';
  sub: string;          // reader id
  tenantSlug: string;
  email: string;
  exp: number;
}

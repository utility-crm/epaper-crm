const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ?? 'http://localhost:8787';

type ApiResult<T> = { ok: boolean; data?: T; error?: { code: string; message: string } };

async function apiFetch<T>(path: string, options: RequestInit = {}, token?: string): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof File) && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json();
    
    if (!data.ok) {
      if (res.status === 401) {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('epaper:unauthorized'));
      } else if (data.error?.message === 'TENANT_SUSPENDED') {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('epaper:tenant-suspended'));
      } else if (data.error?.message === 'TENANT_DELETED') {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('epaper:tenant-deleted'));
      }
    }
    
    return data;
  } catch {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Network error' } };
  }
}

export const portalApi = {
  // auth
  signup: (body: any) => apiFetch<{ token: string; slug: string }>('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  orgLogin: (body: any) => apiFetch<{ token: string; slug: string; status: string }>('/api/auth/org-login', { method: 'POST', body: JSON.stringify(body) }),
  provisionStatus: (token: string) => apiFetch<{ status: string; provision_run_id: string | null }>('/api/auth/provision-status', {}, token),
  verifyProvisioning: (token: string) => apiFetch<{ status: string; recovered?: boolean }>('/api/auth/verify-provisioning', { method: 'POST' }, token),
  retriggerProvisioning: (token: string) => apiFetch<{ reprovisioning: boolean }>('/api/auth/reprovision', { method: 'POST' }, token),

  // editions
  getEditions: (slug: string, token: string) => apiFetch<any>(`/api/content/${slug}/editions`, {}, token),
  createEdition: (slug: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/editions`, { method: 'POST', body: JSON.stringify(body) }, token),
  updateEdition: (slug: string, id: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/editions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  deleteEdition: (slug: string, id: string, token: string) => apiFetch<any>(`/api/content/${slug}/editions/${id}`, { method: 'DELETE' }, token),
  
  getEpapers: (slug: string, editionId: string, token: string) => apiFetch<any>(`/api/content/${slug}/editions/${editionId}/epapers`, {}, token),
  createEpaper: (slug: string, editionId: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/editions/${editionId}/epapers`, { method: 'POST', body: JSON.stringify(body) }, token),
  updateEpaper: (slug: string, id: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/epapers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  deleteEpaper: (slug: string, id: string, token: string) => apiFetch<any>(`/api/content/${slug}/epapers/${id}`, { method: 'DELETE' }, token),
  setDefaultPaper: (slug: string, id: string, token: string) => apiFetch<any>(`/api/content/${slug}/epapers/${id}/default`, { method: 'PATCH' }, token),
  getClickmasks: (slug: string, id: string, token: string) => apiFetch<any>(`/api/content/${slug}/epapers/${id}/clickmasks`, {}, token),
  saveClickmasks: (slug: string, id: string, pageNo: number, clickmasks: any[], token: string) =>
    apiFetch<any>(`/api/content/${slug}/epapers/${id}/pages/${pageNo}/clickmasks`, { method: 'PUT', body: JSON.stringify({ clickmasks }) }, token),

  uploadPages: (slug: string, epaperId: string, files: File[], token: string, cover?: File) => {
    const fd = new FormData();
    if (cover) fd.append('cover', cover);
    files.forEach(f => fd.append('pages', f));
    return apiFetch<any>(
      `/api/content/${slug}/epapers/${epaperId}/upload`,
      { method: 'PUT', body: fd },
      token
    );
  },

  // tiers + plans
  getTiers: (slug: string, token: string) => apiFetch<any>(`/api/content/${slug}/tiers`, {}, token),
  createTier: (slug: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/tiers`, { method: 'POST', body: JSON.stringify(body) }, token),
  updateTier: (slug: string, id: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/tiers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  deleteTier: (slug: string, id: string, token: string) => apiFetch<any>(`/api/content/${slug}/tiers/${id}`, { method: 'DELETE' }, token),
  getPlans: (slug: string, token: string) => apiFetch<any>(`/api/content/${slug}/plans`, {}, token),
  createPlan: (slug: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/plans`, { method: 'POST', body: JSON.stringify(body) }, token),
  updatePlan: (slug: string, id: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  deletePlan: (slug: string, id: string, token: string) => apiFetch<any>(`/api/content/${slug}/plans/${id}`, { method: 'DELETE' }, token),

  // billing config (reader-facing Razorpay creds)
  getRazorpayConfig: (slug: string, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/config`, {}, token),
  saveRazorpayConfig: (slug: string, body: any, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/config`, { method: 'POST', body: JSON.stringify(body) }, token),
  rotateWebhookSecret: (slug: string, token: string) => apiFetch<{ webhook_secret: string }>(`/api/billing/tenant/${slug}/config/webhook-secret/rotate`, { method: 'POST' }, token),
  getReaderSubscriptions: (slug: string, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/subscriptions`, {}, token),
  // user management (org-admin over readers)
  listUsers: (slug: string, token: string, page = 1) => apiFetch<any>(`/api/billing/tenant/${slug}/users?page=${page}`, {}, token),
  createUser: (slug: string, body: { email: string; name: string; password?: string }, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/users`, { method: 'POST', body: JSON.stringify(body) }, token),
  cancelUserSubscription: (slug: string, id: string, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/users/${id}/cancel`, { method: 'POST' }, token),
  deleteUser: (slug: string, id: string, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/users/${id}`, { method: 'DELETE' }, token),
  // reader refund queue (org-admin processes)
  listRefundRequests: (slug: string, token: string, status?: string) => apiFetch<{ items: any[] }>(`/api/billing/tenant/${slug}/refund-requests${status ? `?status=${status}` : ''}`, {}, token),
  processRefundRequest: (slug: string, id: string, body: { action: 'approve' | 'reject'; amount_paise?: number; message?: string }, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/refund-requests/${id}/process`, { method: 'POST', body: JSON.stringify(body) }, token),

  // platform billing (tenant pays platform)
  getPlatformTiers: () => apiFetch<any>('/api/tiers'),
  getPlatformPlans: (token: string) => apiFetch<any>('/api/billing/platform/plans', {}, token),
  getPlatformBillingStatus: (slug: string, token: string) => apiFetch<any>(`/api/billing/platform/${slug}/status`, {}, token),
  subscribeToPlatformPlan: (slug: string, plan_id: string, token: string) =>
    apiFetch<{ subscription_id: string; key_id: string }>('/api/billing/platform/subscribe', { method: 'POST', body: JSON.stringify({ slug, plan_id }) }, token),
  verifyPlatformPayment: (body: { slug: string; razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string }, token: string) =>
    apiFetch<{ verified: boolean; plan: string }>('/api/billing/platform/verify-payment', { method: 'POST', body: JSON.stringify(body) }, token),
  cancelPlatformSubscription: (slug: string, token: string, atCycleEnd = false) =>
    apiFetch<{ cancelled: boolean; at_cycle_end: boolean }>(`/api/billing/platform/${slug}/subscription/cancel`, { method: 'POST', body: JSON.stringify({ at_cycle_end: atCycleEnd }) }, token),
  // tenant raises a refund request to the platform (superadmin processes it)
  requestPlatformRefund: (slug: string, reason: string, token: string) =>
    apiFetch<{ id: string; status: string }>(`/api/billing/platform/${slug}/refund-request`, { method: 'POST', body: JSON.stringify({ reason }) }, token),
  // kept for backwards compat — delegates to subscribeToPlatformPlan
  subscribeToPlatform: (slug: string, plan_id: string, token: string) =>
    apiFetch<any>('/api/billing/platform/subscribe', { method: 'POST', body: JSON.stringify({ slug, plan_id }) }, token),

  // stats + domain
  getTenantStats: (slug: string, token: string) => apiFetch<any>(`/api/content/${slug}/stats`, {}, token),
  recalculateStats: (slug: string, token: string) => apiFetch<any>(`/api/content/${slug}/stats/recalculate`, { method: 'POST' }, token),
  getDomain: (token: string) => apiFetch<any>(`/api/domain`, {}, token),
  setDomain: (domain: string, token: string) => apiFetch<any>(`/api/domain`, { method: 'POST', body: JSON.stringify({ domain }) }, token),
  verifyDomain: (token: string) => apiFetch<any>(`/api/domain/verify`, { method: 'POST' }, token),
  removeDomain: (token: string) => apiFetch<any>(`/api/domain`, { method: 'DELETE' }, token),

  // org settings & branding
  getSettings: (slug: string, token: string) => apiFetch<any>(`/api/content/${slug}/settings`, {}, token),
  updateSettings: (slug: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/settings`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  uploadLogo: (slug: string, file: File, token: string) => apiFetch<any>(`/api/content/${slug}/settings/logo`, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } }, token),
  logoUrl: (slug: string) => `${API_BASE}/api/content/${slug}/settings/logo`,
  uploadFavicon: (slug: string, file: File, token: string) => apiFetch<any>(`/api/content/${slug}/settings/favicon`, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } }, token),
  faviconUrl: (slug: string) => `${API_BASE}/api/content/${slug}/settings/favicon`,
  getPageImage: async (slug: string, id: string, n: number, token: string) => {
    const res = await fetch(`${API_BASE}/api/content/${slug}/epapers/${id}/pages/${n}/image`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.blob();
  },
  pageImageUrl: (slug: string, id: string, n: number) => `${API_BASE}/api/content/${slug}/epapers/${id}/pages/${n}/image`,
  deleteOrganization: (slug: string, token: string) => apiFetch<any>(`/api/content/${slug}/settings`, { method: 'DELETE' }, token),
};

// --- Reader-facing API (public; used by the /read section) ---
export const readerApi = {
  resolveDomain: (host: string) => apiFetch<{ slug: string }>(`/api/domain/resolve?host=${encodeURIComponent(host)}`),
  getSettings: (slug: string) => apiFetch<any>(`/api/content/${slug}/settings`),
  logoUrl: (slug: string) => `${API_BASE}/api/content/${slug}/settings/logo`,
  faviconUrl: (slug: string) => `${API_BASE}/api/content/${slug}/settings/favicon`,
  signup: (slug: string, body: any) => apiFetch<any>(`/api/read/${slug}/signup`, { method: 'POST', body: JSON.stringify(body) }),
  login: (slug: string, body: any) => apiFetch<any>(`/api/read/${slug}/login`, { method: 'POST', body: JSON.stringify(body) }),
  me: (slug: string, token: string) => apiFetch<any>(`/api/read/${slug}/me`, {}, token),
  cancelSubscription: (slug: string, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/reader/subscription/cancel`, { method: 'POST' }, token),
  deleteAccount: (slug: string, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/reader/account`, { method: 'DELETE' }, token),
  getPapers: (slug: string, filters?: { edition_id?: string; start_date?: string; end_date?: string; page?: number; limit?: number }) => {
    let url = `/api/read/${slug}/papers`;
    if (filters) {
      const q = new URLSearchParams();
      if (filters.edition_id) q.set('edition_id', filters.edition_id);
      if (filters.start_date) q.set('start_date', filters.start_date);
      if (filters.end_date) q.set('end_date', filters.end_date);
      if (filters.page) q.set('page', filters.page.toString());
      if (filters.limit) q.set('limit', filters.limit.toString());
      url += '?' + q.toString();
    }
    return apiFetch<any>(url);
  },
  getTodayPaper: (slug: string) => apiFetch<any>(`/api/read/${slug}/today`),
  getPublicEditions: (slug: string) => apiFetch<any>(`/api/read/${slug}/editions`),
  getPaper: (slug: string, id: string, token?: string) => apiFetch<any>(`/api/read/${slug}/papers/${id}`, {}, token),
  getClickmasks: (slug: string, id: string) => apiFetch<any>(`/api/read/${slug}/papers/${id}/clickmasks`),
  getPlans: (slug: string) => apiFetch<any>(`/api/read/${slug}/plans`),
  pageUrl: (slug: string, id: string, n: number) => `${API_BASE}/api/read/${slug}/papers/${id}/pages/${n}`,
  blurredPageUrl: (slug: string, id: string, n: number) => `${API_BASE}/api/read/${slug}/papers/${id}/pages/${n}/blurred`,
  coverUrl: (slug: string, paperId: string) => `${API_BASE}/api/read/${slug}/papers/${paperId}/cover`,
  subscribe: (slug: string, plan_id: string, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/reader/subscribe`, { method: 'POST', body: JSON.stringify({ plan_id }) }, token),
  verify: (slug: string, body: any, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/reader/verify`, { method: 'POST', body: JSON.stringify(body) }, token),
  requestRefund: (slug: string, reason: string, token: string) => apiFetch<{ id: string; status: string; within_policy_window: boolean }>(`/api/billing/tenant/${slug}/reader/refund-request`, { method: 'POST', body: JSON.stringify({ reason }) }, token),
  getRefundRequests: (slug: string, token: string) => apiFetch<{ items: any[] }>(`/api/billing/tenant/${slug}/reader/refund-requests`, {}, token),
};

export const API_BASE_URL = API_BASE;

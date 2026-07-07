const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ?? 'http://localhost:8787';

type ApiResult<T> = { ok: boolean; data?: T; error?: { code: string; message: string } };

async function apiFetch<T>(path: string, options: RequestInit = {}, token?: string): Promise<ApiResult<T>> {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && options.body && !(options.body instanceof File) && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    return res.json();
  } catch {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Network error' } };
  }
}

export const portalApi = {
  // auth
  signup: (body: any) => apiFetch<{ token: string; slug: string }>('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  orgLogin: (body: any) => apiFetch<{ token: string; slug: string; status: string }>('/api/auth/org-login', { method: 'POST', body: JSON.stringify(body) }),
  provisionStatus: (token: string) => apiFetch<{ status: string; provision_run_id: string | null }>('/api/auth/provision-status', {}, token),

  // editions
  getEditions: (slug: string, token: string) => apiFetch<any>(`/api/content/${slug}/editions`, {}, token),
  createEdition: (slug: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/editions`, { method: 'POST', body: JSON.stringify(body) }, token),
  updateEdition: (slug: string, id: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/editions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  deleteEdition: (slug: string, id: string, token: string) => apiFetch<any>(`/api/content/${slug}/editions/${id}`, { method: 'DELETE' }, token),
  
  getEpapers: (slug: string, editionId: string, token: string) => apiFetch<any>(`/api/content/${slug}/editions/${editionId}/epapers`, {}, token),
  createEpaper: (slug: string, editionId: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/editions/${editionId}/epapers`, { method: 'POST', body: JSON.stringify(body) }, token),
  updateEpaper: (slug: string, id: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/epapers/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  setDefaultPaper: (slug: string, id: string, token: string) => apiFetch<any>(`/api/content/${slug}/epapers/${id}/default`, { method: 'PATCH' }, token),
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
  deleteTier: (slug: string, id: string, token: string) => apiFetch<any>(`/api/content/${slug}/tiers/${id}`, { method: 'DELETE' }, token),
  getPlans: (slug: string, token: string) => apiFetch<any>(`/api/content/${slug}/plans`, {}, token),
  createPlan: (slug: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/plans`, { method: 'POST', body: JSON.stringify(body) }, token),
  updatePlan: (slug: string, id: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/plans/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  deletePlan: (slug: string, id: string, token: string) => apiFetch<any>(`/api/content/${slug}/plans/${id}`, { method: 'DELETE' }, token),

  // billing config (reader-facing Razorpay creds)
  getRazorpayConfig: (slug: string, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/config`, {}, token),
  saveRazorpayConfig: (slug: string, body: any, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/config`, { method: 'POST', body: JSON.stringify(body) }, token),
  getReaderSubscriptions: (slug: string, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/subscriptions`, {}, token),

  // platform billing (tenant pays platform)
  getPlatformBillingStatus: (slug: string, token: string) => apiFetch<any>(`/api/billing/platform/${slug}/status`, {}, token),
  subscribeToPlatform: (slug: string, plan_id: string, token: string) => apiFetch<any>(`/api/billing/platform/subscribe`, { method: 'POST', body: JSON.stringify({ slug, plan_id }) }, token),

  // stats + domain
  getTenantStats: (slug: string, token: string) => apiFetch<any>(`/api/content/${slug}/stats`, {}, token),
  getDomain: (token: string) => apiFetch<any>(`/api/domain`, {}, token),
  setDomain: (domain: string, token: string) => apiFetch<any>(`/api/domain`, { method: 'POST', body: JSON.stringify({ domain }) }, token),
  removeDomain: (token: string) => apiFetch<any>(`/api/domain`, { method: 'DELETE' }, token),

  // org settings & branding
  getSettings: (slug: string, token: string) => apiFetch<any>(`/api/content/${slug}/settings`, {}, token),
  updateSettings: (slug: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/settings`, { method: 'PATCH', body: JSON.stringify(body) }, token),
  uploadLogo: (slug: string, file: File, token: string) => apiFetch<any>(`/api/content/${slug}/settings/logo`, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } }, token),
  logoUrl: (slug: string) => `${API_BASE}/api/content/${slug}/settings/logo`,
};

// --- Reader-facing API (public; used by the /read section) ---
export const readerApi = {
  resolveDomain: (host: string) => apiFetch<{ slug: string }>(`/api/domain/resolve?host=${encodeURIComponent(host)}`),
  getSettings: (slug: string) => apiFetch<any>(`/api/content/${slug}/settings`),
  signup: (slug: string, body: any) => apiFetch<any>(`/api/read/${slug}/signup`, { method: 'POST', body: JSON.stringify(body) }),
  login: (slug: string, body: any) => apiFetch<any>(`/api/read/${slug}/login`, { method: 'POST', body: JSON.stringify(body) }),
  me: (slug: string, token: string) => apiFetch<any>(`/api/read/${slug}/me`, {}, token),
  getPapers: (slug: string, filters?: { edition_id?: string; start_date?: string; end_date?: string }) => {
    let url = `/api/read/${slug}/papers`;
    if (filters) {
      const q = new URLSearchParams();
      if (filters.edition_id) q.set('edition_id', filters.edition_id);
      if (filters.start_date) q.set('start_date', filters.start_date);
      if (filters.end_date) q.set('end_date', filters.end_date);
      url += '?' + q.toString();
    }
    return apiFetch<any>(url);
  },
  getTodayPaper: (slug: string) => apiFetch<any>(`/api/read/${slug}/today`),
  getPublicEditions: (slug: string) => apiFetch<any>(`/api/read/${slug}/editions`),
  getPaper: (slug: string, id: string, token?: string) => apiFetch<any>(`/api/read/${slug}/papers/${id}`, {}, token),
  getPlans: (slug: string) => apiFetch<any>(`/api/read/${slug}/plans`),
  pageUrl: (slug: string, id: string, n: number) => `${API_BASE}/api/read/${slug}/papers/${id}/pages/${n}`,
  coverUrl: (slug: string, paperId: string) => `${API_BASE}/api/read/${slug}/papers/${paperId}/cover`,
  subscribe: (slug: string, plan_id: string, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/reader/subscribe`, { method: 'POST', body: JSON.stringify({ plan_id }) }, token),
  verify: (slug: string, body: any, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/reader/verify`, { method: 'POST', body: JSON.stringify(body) }, token),
};

export const API_BASE_URL = API_BASE;

import { ApiResponse } from '@epaper/types';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const adminToken = localStorage.getItem('epaper:adminToken');
  const orgToken = localStorage.getItem('epaper:orgToken');
  
  const headers = new Headers(options.headers || {});
  
  // Choose token based on path (simple heuristic)
  if (path.startsWith('/api/auth/admin-login') || path.startsWith('/api/auth/signup') || path.startsWith('/api/auth/org-login')) {
    // No auth needed
  } else if (path.startsWith('/api/tenants') || path.startsWith('/api/audit')) {
    if (adminToken) headers.set('Authorization', `Bearer ${adminToken}`);
  } else {
    if (orgToken) headers.set('Authorization', `Bearer ${orgToken}`);
  }
  
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }

  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    return data as ApiResponse<T>;
  } catch (e) {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Network error occurred' } };
  }
}

export const api = {
  adminLogin: (data: any) => apiFetch<{token: string}>('/api/auth/admin-login', { method: 'POST', body: JSON.stringify(data) }),
  signup: (data: any) => apiFetch<{token: string, slug: string}>('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
  orgLogin: (data: any) => apiFetch<{token: string, slug: string, status: string}>('/api/auth/org-login', { method: 'POST', body: JSON.stringify(data) }),
  getProvisionStatus: () => apiFetch<any>('/api/auth/provision-status'),
  getTenants: (status?: string) => apiFetch<any>(`/api/tenants${status ? `?status=${status}` : ''}`),
  getTenant: (slug: string) => apiFetch<any>(`/api/tenants/${slug}`),
  patchTenant: (slug: string, body: any) => apiFetch<any>(`/api/tenants/${slug}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTenant: (slug: string) => apiFetch<any>(`/api/tenants/${slug}`, { method: 'DELETE' }),
  getAuditLog: () => apiFetch<any>('/api/audit'),
  getEditions: (slug: string) => apiFetch<any>(`/api/content/${slug}/editions`),
  createEdition: (slug: string, body: any) => apiFetch<any>(`/api/content/${slug}/editions`, { method: 'POST', body: JSON.stringify(body) }),
  uploadEditionPdf: (slug: string, id: string, file: File) => {
    return apiFetch<any>(`/api/content/${slug}/editions/${id}/upload`, { 
      method: 'PUT', 
      body: file,
      headers: { 'Content-Type': file.type }
    });
  },
  getPlatformBillingStatus: (slug: string) => apiFetch<any>(`/api/billing/platform/${slug}/status`)
};

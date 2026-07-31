import React, { useState } from 'react';

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ?? 'http://localhost:8787';

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<{ ok: boolean; data?: T; error?: { code: string; message: string } }> {
  const adminToken = localStorage.getItem('epaper:adminToken');
  const orgToken = localStorage.getItem('epaper:orgToken');

  const headers = new Headers(options.headers || {});
  if (adminToken && !path.includes('admin-login') && !path.includes('setup')) {
    headers.set('Authorization', `Bearer ${adminToken}`);
  } else if (orgToken && !adminToken) {
    headers.set('Authorization', `Bearer ${orgToken}`);
  }
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');

  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const data = await res.json();
    if ((res.status === 401 || res.status === 403) && !path.includes('admin-login') && !path.includes('setup')) {
      localStorage.removeItem('epaper:adminToken');
      window.location.href = '/admin-login';
    }
    return data;
  } catch {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Network error' } };
  }
}

export const crmApi = {
  setupStatus: () => apiFetch<{ setupDone: boolean }>('/api/auth/setup-status'),
  setup: (body: { email: string; password: string }) => apiFetch<{ token: string }>('/api/auth/setup', { method: 'POST', body: JSON.stringify(body) }),
  adminLogin: (body: { email: string; password: string }) => apiFetch<{ token: string }>('/api/auth/admin-login', { method: 'POST', body: JSON.stringify(body) }),
  adminMe: () => apiFetch<{ id: string; email: string; role: string }>('/api/auth/me'),
  getTenants: (status?: string, page = 1) => apiFetch<any>(`/api/tenants?page=${page}${status ? `&status=${status}` : ''}`),
  getTenant: (slug: string) => apiFetch<any>(`/api/tenants/${slug}`),
  patchTenant: (slug: string, body: any) => apiFetch<any>(`/api/tenants/${slug}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteTenant: (slug: string) => apiFetch<any>(`/api/tenants/${slug}`, { method: 'DELETE' }),
  getAuditLog: (page = 1, tenantId?: string) => apiFetch<any>(`/api/audit?page=${page}${tenantId ? `&tenant_id=${tenantId}` : ''}`),
  reprovisionTenant: (slug: string) => apiFetch<any>(`/api/tenants/internal/${slug}/reprovision`, { method: 'POST' }),
  
  // Admins
  updatePassword: (body: any) => apiFetch<any>('/api/auth/me/password', { method: 'PATCH', body: JSON.stringify(body) }),
  getAdmins: () => apiFetch<any>('/api/auth/admins'),
  createAdmin: (body: any) => apiFetch<any>('/api/auth/admins', { method: 'POST', body: JSON.stringify(body) }),
  deleteAdmin: (id: string) => apiFetch<any>(`/api/auth/admins/${id}`, { method: 'DELETE' }),

  // Platform config (superadmin): metered SMS rate + FX fallback + SMS abuse controls.
  getPlatformConfig: () => apiFetch<any>('/api/admin/platform-config'),
  updatePlatformConfig: (body: { sms_rate_usd: number; usd_inr_fallback?: number; sms_daily_cap?: number; sms_disabled?: boolean }) =>
    apiFetch<any>('/api/admin/platform-config', { method: 'PATCH', body: JSON.stringify(body) }),

  // Tiers
  getTiers: () => apiFetch<any>('/api/tiers'),
  createTier: (body: any) => apiFetch<any>('/api/tiers', { method: 'POST', body: JSON.stringify(body) }),
  updateTier: (id: string, body: any) => apiFetch<any>(`/api/tiers/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteTier: (id: string) => apiFetch<any>(`/api/tiers/${id}`, { method: 'DELETE' }),
  
  // Billing
  getPlatformBillingStatus: (slug: string) => apiFetch<any>(`/api/admin/billing/platform/${slug}/status`),
  getPlatformBillingEvents: (slug: string) => apiFetch<any>(`/api/admin/billing/platform/${slug}/events`),
  getPlatformPlans: () => apiFetch<any>('/api/admin/billing/platform/plans'),

  // Platform refund queue (Publication → Platform), superadmin only
  listPlatformRefundRequests: (status?: string) => apiFetch<{ items: any[] }>(`/api/admin/billing/platform/refund-requests${status ? `?status=${status}` : ''}`),
  processPlatformRefundRequest: (id: string, body: { action: 'approve' | 'reject'; amount_paise?: number; message?: string }) =>
    apiFetch<any>(`/api/admin/billing/platform/refund-requests/${id}/process`, { method: 'POST', body: JSON.stringify(body) }),

  // Publisher (tenant) subscriptions to the platform, superadmin only. Manual grants for
  // publications paying offline/by contract — reader subscriptions are the publisher's own
  // concern and are granted from their portal, not here.
  getTenantSubscription: (slug: string) => apiFetch<any>(`/api/admin/tenant-subscriptions/${slug}`),
  grantTenantSubscription: (slug: string, body: { plan: string; start_at?: string; end_at: string; note?: string }) =>
    apiFetch<any>(`/api/admin/tenant-subscriptions/${slug}`, { method: 'POST', body: JSON.stringify(body) }),
  patchTenantSubscription: (slug: string, body: { end_at?: string; deactivate?: boolean; note?: string }) =>
    apiFetch<any>(`/api/admin/tenant-subscriptions/${slug}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // Email delivery monitoring (Resend webhook events), superadmin only
  listEmailEvents: (params?: { lane?: string; slug?: string }) => {
    const q = new URLSearchParams();
    if (params?.lane) q.set('lane', params.lane);
    if (params?.slug) q.set('slug', params.slug);
    const qs = q.toString();
    return apiFetch<{ items: any[] }>(`/api/admin/billing/platform/email-events${qs ? `?${qs}` : ''}`);
  },
};

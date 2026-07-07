import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_URL) ?? 'http://localhost:8787';

async function apiFetch<T>(path: string, options: RequestInit = {}, token?: string): Promise<{ ok: boolean; data?: T; error?: { code: string; message: string } }> {
  const headers = new Headers(options.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && options.body) headers.set('Content-Type', 'application/json');
  try {
    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    return res.json();
  } catch {
    return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Network error' } };
  }
}

export const portalApi = {
  signup: (body: any) => apiFetch<{ token: string; slug: string }>('/api/auth/signup', { method: 'POST', body: JSON.stringify(body) }),
  orgLogin: (body: any) => apiFetch<{ token: string; slug: string; status: string }>('/api/auth/org-login', { method: 'POST', body: JSON.stringify(body) }),
  provisionStatus: (token: string) => apiFetch<{ status: string; provision_run_id: string | null }>('/api/auth/provision-status', {}, token),
  getEditions: (slug: string, token: string) => apiFetch<any>(`/api/content/${slug}/editions`, {}, token),
  createEdition: (slug: string, body: any, token: string) => apiFetch<any>(`/api/content/${slug}/editions`, { method: 'POST', body: JSON.stringify(body) }, token),
  uploadPdf: (slug: string, editionId: string, file: File, token: string) => apiFetch<any>(
    `/api/content/${slug}/editions/${editionId}/upload`,
    { method: 'PUT', body: file, headers: { 'Content-Type': 'application/pdf' } },
    token
  ),
  getRazorpayConfig: (slug: string, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/config`, {}, token),
  saveRazorpayConfig: (slug: string, body: any, token: string) => apiFetch<any>(`/api/billing/tenant/${slug}/config`, { method: 'POST', body: JSON.stringify(body) }, token),
};

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8787';
export async function apiFetch(path, options = {}) {
    const adminToken = localStorage.getItem('epaper:adminToken');
    const orgToken = localStorage.getItem('epaper:orgToken');
    const headers = new Headers(options.headers || {});
    // Choose token based on path (simple heuristic)
    if (path.startsWith('/api/auth/admin-login') || path.startsWith('/api/auth/signup') || path.startsWith('/api/auth/org-login')) {
        // No auth needed
    }
    else if (path.startsWith('/api/tenants') || path.startsWith('/api/audit')) {
        if (adminToken)
            headers.set('Authorization', `Bearer ${adminToken}`);
    }
    else {
        if (orgToken)
            headers.set('Authorization', `Bearer ${orgToken}`);
    }
    if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
        headers.set('Content-Type', 'application/json');
    }
    const url = `${API_BASE}${path}`;
    try {
        const res = await fetch(url, { ...options, headers });
        const data = await res.json();
        return data;
    }
    catch (e) {
        return { ok: false, error: { code: 'NETWORK_ERROR', message: 'Network error occurred' } };
    }
}
export const api = {
    adminLogin: (data) => apiFetch('/api/auth/admin-login', { method: 'POST', body: JSON.stringify(data) }),
    signup: (data) => apiFetch('/api/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
    orgLogin: (data) => apiFetch('/api/auth/org-login', { method: 'POST', body: JSON.stringify(data) }),
    getProvisionStatus: () => apiFetch('/api/auth/provision-status'),
    getTenants: (status) => apiFetch(`/api/tenants${status ? `?status=${status}` : ''}`),
    getTenant: (slug) => apiFetch(`/api/tenants/${slug}`),
    patchTenant: (slug, body) => apiFetch(`/api/tenants/${slug}`, { method: 'PATCH', body: JSON.stringify(body) }),
    deleteTenant: (slug) => apiFetch(`/api/tenants/${slug}`, { method: 'DELETE' }),
    getAuditLog: () => apiFetch('/api/audit'),
    getEditions: (slug) => apiFetch(`/api/content/${slug}/editions`),
    createEdition: (slug, body) => apiFetch(`/api/content/${slug}/editions`, { method: 'POST', body: JSON.stringify(body) }),
    uploadEditionPdf: (slug, id, file) => {
        return apiFetch(`/api/content/${slug}/editions/${id}/upload`, {
            method: 'PUT',
            body: file,
            headers: { 'Content-Type': file.type }
        });
    },
    getPlatformBillingStatus: (slug) => apiFetch(`/api/billing/platform/${slug}/status`)
};

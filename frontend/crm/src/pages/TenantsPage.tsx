import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { crmApi } from '../lib/api';
import { TenantTable } from '../components/TenantTable';

const STATUS_FILTERS = ['all', 'pending', 'provisioning', 'active', 'suspended', 'deleted'];

export function TenantsPage() {
  const navigate = useNavigate();
  const [tenants, setTenants] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const loadTenants = useCallback(async () => {
    setLoading(true);
    try {
      const res = await crmApi.getTenants(statusFilter === 'all' ? undefined : statusFilter, page);
      if (res.ok && res.data) {
        setTenants(res.data.items ?? []);
        setTotal(res.data.total ?? 0);
      }
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { loadTenants(); }, [loadTenants]);

  const handleSuspend = async (slug: string) => {
    await crmApi.patchTenant(slug, { status: 'suspended' });
    await loadTenants();
  };

  const handleDelete = async (slug: string) => {
    await crmApi.deleteTenant(slug);
    await loadTenants();
  };

  const filtered = search
    ? tenants.filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || t.slug.includes(search))
    : tenants;

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>Tenants</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>All registered organisations across the platform</p>
      </div>

      {/* Status filter tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(s => (
          <button key={s} onClick={() => { setStatusFilter(s); setPage(1); }} style={{
            padding: '6px 14px', borderRadius: 8, border: '1px solid', cursor: 'pointer',
            fontWeight: statusFilter === s ? 600 : 400, fontSize: '0.85rem',
            background: statusFilter === s ? 'var(--color-brand-primary)' : 'transparent',
            color: statusFilter === s ? 'white' : 'var(--color-text-secondary)',
            borderColor: statusFilter === s ? 'var(--color-brand-primary)' : 'var(--color-border)',
          }}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input className="input" placeholder="Search by name or slug…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ maxWidth: 360 }} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          <TenantTable
            tenants={filtered}
            onView={slug => navigate(`/tenants/${slug}`)}
            onSuspend={handleSuspend}
            onDelete={handleDelete}
          />

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
              <span style={{ padding: '10px 16px', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>
                Page {page} of {totalPages}
              </span>
              <button className="btn-secondary" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

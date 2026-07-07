import React, { useEffect, useState } from 'react';
import { crmApi } from '../lib/api';

export function AuditLogPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [tenantFilter, setTenantFilter] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    crmApi.getAuditLog(page, tenantFilter || undefined).then(res => {
      if (res.ok && res.data) {
        setEvents(res.data.items ?? []);
        setTotal(res.data.total ?? 0);
      }
      setLoading(false);
    });
  }, [page, tenantFilter]);

  const filtered = search
    ? events.filter(e => e.action?.includes(search) || e.performed_by?.includes(search) || e.tenant_id?.includes(search))
    : events;

  const totalPages = Math.ceil(total / 20);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>Audit Log</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>Immutable record of all platform actions</p>
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input className="input" placeholder="Search action, actor…" value={search}
          onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
        <input className="input" placeholder="Filter by tenant ID…" value={tenantFilter}
          onChange={e => { setTenantFilter(e.target.value); setPage(1); }} style={{ maxWidth: 280 }} />
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Action</th>
                <th>Performed By</th>
                <th>Tenant</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>No events found</td></tr>
              ) : filtered.map((e, i) => (
                <tr key={e.id ?? i}>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', background: 'rgba(99,102,241,0.1)',
                      padding: '2px 8px', borderRadius: 4, color: 'var(--color-brand-primary)' }}>
                      {e.action}
                    </span>
                  </td>
                  <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{e.performed_by}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
                    {e.tenant_id ? e.tenant_id.slice(0, 8) + '…' : '—'}
                  </td>
                  <td style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {e.details || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn-secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span style={{ padding: '10px 16px', color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Page {page} of {totalPages}</span>
          <button className="btn-secondary" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

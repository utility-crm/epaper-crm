import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { crmApi } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';

interface Stats {
  total: number;
  active: number;
  provisioning: number;
  pending: number;
  suspended: number;
}

export function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentAudit, setRecentAudit] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [all, active, prov, pend, susp, auditRes] = await Promise.all([
          crmApi.getTenants(),
          crmApi.getTenants('active'),
          crmApi.getTenants('provisioning'),
          crmApi.getTenants('pending'),
          crmApi.getTenants('suspended'),
          crmApi.getAuditLog(1)
        ]);
        setStats({
          total: all.data?.total ?? 0,
          active: active.data?.total ?? 0,
          provisioning: prov.data?.total ?? 0,
          pending: pend.data?.total ?? 0,
          suspended: susp.data?.total ?? 0,
        });
        if (auditRes.ok) setRecentAudit(auditRes.data?.items || []);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statCards = [
    { label: 'Total Tenants', value: stats?.total, color: 'var(--color-brand-primary)' },
    { label: 'Active', value: stats?.active, color: 'var(--color-success)' },
    { label: 'Provisioning', value: stats?.provisioning, color: 'var(--color-info)' },
    { label: 'Pending', value: stats?.pending, color: 'var(--color-warning)' },
    { label: 'Suspended', value: stats?.suspended, color: 'var(--color-danger)' },
  ];

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>Platform Overview</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>Real-time tenant and billing summary</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', gap: 16 }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} className="card" style={{ flex: 1, height: 100, background: 'var(--color-bg-elevated)', animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
            {statCards.map(card => (
              <div key={card.label} className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
                <div style={{ fontSize: '2.5rem', fontWeight: 700, color: card.color, lineHeight: 1 }}>
                  {card.value ?? '—'}
                </div>
                <div style={{ color: 'var(--color-text-secondary)', marginTop: 8, fontSize: '0.85rem' }}>{card.label}</div>
              </div>
            ))}
          </div>
          
          <div className="card" style={{ marginBottom: 32, padding: '24px' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Status Distribution</h2>
            <div style={{ display: 'flex', height: 24, borderRadius: 12, overflow: 'hidden', background: 'var(--color-bg-elevated)', marginBottom: 12 }}>
              {statCards.slice(1).map(card => {
                const width = stats?.total ? ((card.value || 0) / stats.total) * 100 : 0;
                if (width === 0) return null;
                return (
                  <div key={card.label} style={{ width: `${width}%`, background: card.color, transition: 'width 1s ease-out' }} title={`${card.label}: ${card.value}`} />
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--color-text-muted)', flexWrap: 'wrap' }}>
              {statCards.slice(1).map(card => (
                <div key={card.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: card.color }} />
                  {card.label} ({card.value})
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 20 }}>
        <div className="card" style={{ padding: '20px 24px', height: 'fit-content' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Quick Actions</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Link to="/tenants" style={{ textDecoration: 'none' }}>
              <button className="btn-secondary" style={{ width: '100%', justifyContent: 'flex-start' }}>View All Tenants</button>
            </Link>
            <Link to="/audit" style={{ textDecoration: 'none' }}>
              <button className="btn-secondary" style={{ width: '100%', justifyContent: 'flex-start' }}>Audit Log</button>
            </Link>
          </div>
        </div>

        <div className="card" style={{ padding: '20px 24px' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Recent Activity</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Date</th>
                  <th style={{ padding: '8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Action</th>
                  <th style={{ padding: '8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Admin</th>
                </tr>
              </thead>
              <tbody>
                {recentAudit.slice(0, 5).map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '8px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{new Date(log.created_at).toLocaleString()}</td>
                    <td style={{ padding: '8px', fontSize: '0.85rem' }}>
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>{log.action}</span>
                    </td>
                    <td style={{ padding: '8px', fontSize: '0.85rem' }}>{log.performed_by === 'system' || log.performed_by === 'system_self_serve' ? log.performed_by : 'Admin'}</td>
                  </tr>
                ))}
                {recentAudit.length === 0 && !loading && (
                  <tr><td colSpan={3} style={{ padding: 12, textAlign: 'center', color: 'var(--color-text-muted)' }}>No recent activity</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

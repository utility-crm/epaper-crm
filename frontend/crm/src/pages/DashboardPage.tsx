import React, { useEffect, useState } from 'react';
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [all, active, prov, pend, susp] = await Promise.all([
          crmApi.getTenants(),
          crmApi.getTenants('active'),
          crmApi.getTenants('provisioning'),
          crmApi.getTenants('pending'),
          crmApi.getTenants('suspended'),
        ]);
        setStats({
          total: all.data?.total ?? 0,
          active: active.data?.total ?? 0,
          provisioning: prov.data?.total ?? 0,
          pending: pend.data?.total ?? 0,
          suspended: susp.data?.total ?? 0,
        });
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 32 }}>
          {statCards.map(card => (
            <div key={card.label} className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 700, color: card.color, lineHeight: 1 }}>
                {card.value ?? '—'}
              </div>
              <div style={{ color: 'var(--color-text-secondary)', marginTop: 8, fontSize: '0.85rem' }}>{card.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="card" style={{ padding: '20px 24px' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 12 }}>Quick Actions</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <a href="/crm/tenants" style={{ textDecoration: 'none' }}>
            <button className="btn-secondary" style={{ fontSize: '0.875rem' }}>View All Tenants</button>
          </a>
          <a href="/crm/audit" style={{ textDecoration: 'none' }}>
            <button className="btn-secondary" style={{ fontSize: '0.875rem' }}>Audit Log</button>
          </a>
        </div>
      </div>
    </div>
  );
}

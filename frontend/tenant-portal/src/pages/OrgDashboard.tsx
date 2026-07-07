import React, { useEffect, useState } from 'react';
import { portalApi } from '../lib/api';

interface OrgDashboardProps {
  slug: string;
  token: string;
}

export function OrgDashboard({ slug, token }: OrgDashboardProps) {
  const [editions, setEditions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    portalApi.getEditions(slug, token).then(res => {
      if (res.ok && res.data) setEditions(res.data.items ?? []);
      setLoading(false);
    });
  }, [slug, token]);

  const draftCount = editions.filter(e => e.status === 'draft').length;
  const publishedCount = editions.filter(e => e.status === 'published').length;

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>Dashboard</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Welcome back! Your organisation is live on <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-brand-primary)' }}>{slug}</span>.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Editions', value: editions.length, color: 'var(--color-brand-primary)' },
          { label: 'Published', value: publishedCount, color: 'var(--color-success)' },
          { label: 'Drafts', value: draftCount, color: 'var(--color-warning)' },
        ].map(c => (
          <div key={c.label} className="card" style={{ textAlign: 'center', padding: '24px 16px' }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 700, color: c.color, lineHeight: 1 }}>{loading ? '—' : c.value}</div>
            <div style={{ color: 'var(--color-text-secondary)', marginTop: 8, fontSize: '0.85rem' }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Quick Actions</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <a href="/portal/editions" style={{ textDecoration: 'none' }}>
            <button className="btn-primary" style={{ fontSize: '0.875rem' }}>Manage Editions</button>
          </a>
          <a href="/portal/billing" style={{ textDecoration: 'none' }}>
            <button className="btn-secondary" style={{ fontSize: '0.875rem' }}>Configure Billing</button>
          </a>
        </div>
      </div>
    </div>
  );
}

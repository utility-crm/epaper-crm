import React, { useState, useEffect } from 'react';
import { portalApi } from '../lib/api';

interface PlatformBillingPageProps {
  slug: string;
  token: string;
}

export function PlatformBillingPage({ slug, token }: PlatformBillingPageProps) {
  const [status, setStatus] = useState<any>(null);
  const [tiers, setTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      portalApi.getPlatformBillingStatus(slug, token),
      portalApi.getPlatformTiers()
    ]).then(([statusRes, tiersRes]) => {
      if (statusRes.ok && statusRes.data) setStatus(statusRes.data);
      else setError(statusRes.error?.message || 'Failed to load billing status');
      
      if (tiersRes.ok && tiersRes.data) setTiers(tiersRes.data);
      
      setLoading(false);
    });
  }, [slug, token]);

  const handleSubscribe = async (tierId: string) => {
    if (!confirm('Are you sure you want to subscribe to this plan? (Placeholder for actual flow)')) return;
    
    setError('');
    const res = await portalApi.subscribeToPlatform(slug, tierId, token);
    if (res.ok) {
      alert('Subscription created successfully!');
      window.location.reload();
    } else {
      setError(res.error?.message || 'Subscription failed');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>Platform Billing</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>Manage your organisation's subscription to the ePaper CMS platform</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : (
        <div>
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, padding: '10px 14px', color: 'var(--color-danger)', fontSize: '0.875rem', marginBottom: 24 }}>
              {error}
            </div>
          )}

          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid var(--color-border)',
            borderRadius: 12, padding: '20px 24px', marginBottom: 32 }}>
            <h2 style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Current Plan</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>
                {status?.plan || 'Starter'}
              </span>
              <span className={`status-badge ${status?.has_subscription ? 'status-published' : 'status-archived'}`}>
                {status?.has_subscription ? (status?.razorpay_status || 'Active') : 'Manual/Free'}
              </span>
            </div>
          </div>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 16 }}>Available Plans</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20 }}>
            {tiers.map(tier => {
              const isCurrent = status?.plan?.toLowerCase() === tier.name.toLowerCase();
              return (
                <div key={tier.id} className="card" style={{ display: 'flex', flexDirection: 'column', padding: '28px 24px', border: isCurrent ? '1px solid var(--color-brand-primary)' : undefined }}>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8, color: isCurrent ? 'var(--color-brand-primary)' : 'inherit', textTransform: 'capitalize' }}>
                    {tier.name}
                  </h3>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 16 }}>
                    {tier.price_inr > 0 ? `₹${tier.price_inr}` : 'Free'}
                    <span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>/{tier.billing_cycle === 'yearly' ? 'yr' : 'mo'}</span>
                    {tier.tax_percentage > 0 && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: 400 }}>+{tier.tax_percentage}% tax</div>}
                  </div>
                  <ul style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 24, paddingLeft: 18, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <li>Up to {tier.max_storage_mb >= 1024 ? `${(tier.max_storage_mb / 1024).toFixed(1)} GB` : `${tier.max_storage_mb} MB`} Storage</li>
                    <li>{tier.max_views_per_day} Views / Day</li>
                    <li>{tier.max_simultaneous_editions} Simultaneous Editions</li>
                    <li>{tier.max_papers_per_day} Papers / Day</li>
                  </ul>
                  {isCurrent ? (
                    <button className="btn-secondary" disabled>Current Plan</button>
                  ) : (
                    <button className="btn-primary" onClick={() => handleSubscribe(tier.id)}>Subscribe</button>
                  )}
                </div>
              );
            })}
            
            {tiers.length === 0 && (
              <div style={{ color: 'var(--color-text-muted)' }}>No plans available.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

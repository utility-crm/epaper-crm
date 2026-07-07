import React, { useState, useEffect } from 'react';
import { portalApi } from '../lib/api';

interface PlatformBillingPageProps {
  slug: string;
  token: string;
}

export function PlatformBillingPage({ slug, token }: PlatformBillingPageProps) {
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    portalApi.getPlatformBillingStatus(slug, token).then(res => {
      if (res.ok && res.data) setStatus(res.data);
      else setError(res.error?.message || 'Failed to load billing status');
      setLoading(false);
    });
  }, [slug, token]);

  const handleSubscribe = async (planId: string) => {
    if (!confirm('Are you sure you want to subscribe to this plan? (Placeholder for actual flow)')) return;
    
    setError('');
    const res = await portalApi.subscribeToPlatform(slug, planId, token);
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
            {/* Starter Plan */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '28px 24px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8 }}>Starter</h3>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 16 }}>Free</div>
              <ul style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 24, paddingLeft: 18, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <li>Up to 100GB Storage</li>
                <li>Basic Analytics</li>
                <li>Community Support</li>
              </ul>
              <button className="btn-secondary" disabled>Current Plan</button>
            </div>

            {/* Growth Plan */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '28px 24px', border: '1px solid var(--color-brand-primary)' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8, color: 'var(--color-brand-primary)' }}>Growth</h3>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 16 }}>$99<span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>/mo</span></div>
              <ul style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 24, paddingLeft: 18, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <li>Up to 500GB Storage</li>
                <li>Advanced Analytics</li>
                <li>Priority Email Support</li>
              </ul>
              <button className="btn-primary" onClick={() => handleSubscribe('plan_growth_placeholder')}>Subscribe</button>
            </div>

            {/* Enterprise Plan */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', padding: '28px 24px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8 }}>Enterprise</h3>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 16 }}>$299<span style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>/mo</span></div>
              <ul style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 24, paddingLeft: 18, flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <li>Up to 2TB Storage</li>
                <li>Custom Integrations</li>
                <li>24/7 Phone Support</li>
              </ul>
              <button className="btn-secondary" onClick={() => handleSubscribe('plan_enterprise_placeholder')}>Subscribe</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { portalApi } from '../lib/api';
import { usePlatformCheckout } from '../hooks/usePlatformCheckout';

interface PlatformBillingPageProps {
  slug: string;
  token: string;
  orgName?: string;
  email?: string;
}

interface RazorpayPlan {
  id: string;
  period: string;        // 'monthly' | 'yearly'
  interval: number;
  item: {
    name: string;
    amount: number;      // in paise
    unit_amount: number; // in paise
    currency: string;
    description?: string;
  };
}

import { useCurrencyConverter } from '../lib/useCurrencyConverter';

export function PlatformBillingPage({ slug, token, orgName = '', email = '' }: PlatformBillingPageProps) {
  const [status, setStatus]       = useState<any>(null);
  const [tiers, setTiers]         = useState<any[]>([]);
  const [loadingTiers, setLoadingTiers] = useState(true);
  const [paying, setPaying]       = useState<string | null>(null); // plan_id being paid
  const [error, setError]         = useState('');
  const [successMsg, setSuccess]  = useState('');
  
  const { formatAmount, loading: loadingCurrency } = useCurrencyConverter();
  
  const loading = loadingTiers || loadingCurrency;

  // Load billing status + live plans from Razorpay Dashboard in parallel.
  useEffect(() => {
    Promise.all([
      portalApi.getPlatformBillingStatus(slug, token),
      portalApi.getPlatformTiers(),
    ]).then(([statusRes, tiersRes]) => {
      if (statusRes.ok && statusRes.data) setStatus(statusRes.data);
      else setError(statusRes.error?.message || 'Failed to load billing status');

      if (tiersRes.ok && tiersRes.data) {
        setTiers(tiersRes.data);
      }
      setLoadingTiers(false);
    });
  }, [slug, token]);

  const handleSuccess = useCallback((plan: string) => {
    setPaying(null);
    setSuccess(`You're now subscribed to the ${plan} plan. Auto-debit mandate is active.`);
    // Refresh status after a short delay to show updated state.
    setTimeout(() => {
      portalApi.getPlatformBillingStatus(slug, token).then(res => {
        if (res.ok && res.data) setStatus(res.data);
      });
    }, 1500);
  }, [slug, token]);

  const handleError = useCallback((message: string) => {
    setPaying(null);
    if (message) setError(message);
  }, []);

  const { openCheckout } = usePlatformCheckout({
    slug,
    token,
    orgName,
    email,
    onSuccess: handleSuccess,
    onError: handleError,
  });

  const handleSubscribe = useCallback(async (tier: any) => {
    if (!tier.razorpay_plan_id) return;
    setError('');
    setSuccess('');
    setPaying(tier.razorpay_plan_id);
    await openCheckout(tier.razorpay_plan_id, tier.name);
  }, [openCheckout]);

  return (
    <div>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>Platform Billing</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>
          Manage your organisation's subscription to the ePaper CMS platform
        </p>
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

          {successMsg && (
            <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: 8, padding: '10px 14px', color: 'var(--color-success)', fontSize: '0.875rem', marginBottom: 24 }}>
              {successMsg}
            </div>
          )}

          {/* Current plan status */}
          <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid var(--color-border)',
            borderRadius: 12, padding: '20px 24px', marginBottom: 32 }}>
            <h2 style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Current Plan</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--color-text-primary)', textTransform: 'capitalize' }}>
                {status?.plan || 'Starter'}
              </span>
              <span className={`status-badge ${status?.has_subscription ? 'status-published' : 'status-archived'}`}>
                {status?.has_subscription ? (status?.razorpay_status || 'Active') : 'Free / Manual'}
              </span>
            </div>
            {status?.has_subscription && (
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 6 }}>
                Auto-debit mandate is active — Razorpay will charge on renewal.
              </p>
            )}
          </div>

          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 16 }}>Available Plans</h2>

          {tiers.length === 0 && (
            <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px dashed var(--color-border)',
              borderRadius: 12, padding: '32px 24px', textAlign: 'center', color: 'var(--color-text-secondary)', marginBottom: 20 }}>
              <p style={{ marginBottom: 8 }}>No plans have been configured yet.</p>
            </div>
          )}

          {/* Plan tiers: 4 equal columns */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 20, marginBottom: 20 }}>
            {tiers.map((tier) => {
                const isCurrentPlan = status?.has_subscription && status?.razorpay_status === 'active' && status?.plan?.toLowerCase() === tier.name.toLowerCase();
                const isManualFree = !status?.has_subscription && tier.price_inr === 0;
                const isCurrent = isCurrentPlan || (isManualFree && !status?.has_subscription); // approximate
                const isLoading = Boolean(paying) && paying === tier.razorpay_plan_id;
                const amount = tier.price_inr;

                return (
                  <div
                    key={tier.id}
                    className="card"
                    style={{ display: 'flex', flexDirection: 'column', padding: '28px 24px',
                      border: isCurrent ? '1px solid var(--color-brand-primary)' : undefined }}
                  >
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8,
                      color: isCurrent ? 'var(--color-brand-primary)' : undefined, textTransform: 'capitalize' }}>
                      {tier.name}
                    </h3>

                    <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>
                      {amount > 0 ? formatAmount(amount, tier.billing_cycle || 'monthly') : 'Free'}
                    </div>
                    {amount > 0 ? (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 16, textTransform: 'capitalize' }}>
                        Billed {tier.billing_cycle || 'monthly'} · auto-debit via mandate
                        {tier.tax_percentage > 0 && <span style={{display: 'block', marginTop: 4, fontWeight: 500}}>+ {tier.tax_percentage}% tax (calculated at checkout)</span>}
                      </div>
                    ) : (
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
                        No credit card required
                      </div>
                    )}

                    <ul style={{ margin: '0 0 24px 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
                      <li style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--color-success)', flexShrink: 0 }}>✓</span>
                        <span><strong style={{ whiteSpace: 'nowrap' }}>{tier.max_storage_mb >= 1024 ? `${(tier.max_storage_mb / 1024).toFixed(1)} GB` : `${tier.max_storage_mb} MB`}</strong> Storage</span>
                      </li>
                      <li style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--color-success)', flexShrink: 0 }}>✓</span>
                        <span><strong style={{ whiteSpace: 'nowrap' }}>{tier.max_views_per_day.toLocaleString()}</strong> Views / Day</span>
                      </li>
                      <li style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--color-success)', flexShrink: 0 }}>✓</span>
                        <span>Up to <strong style={{ whiteSpace: 'nowrap' }}>{tier.max_papers_per_day}</strong> Papers / Day</span>
                      </li>
                      {tier.features && tier.features.map((f: string, i: number) => (
                        <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: '0.85rem' }}>
                          <span style={{ color: 'var(--color-brand-primary)', flexShrink: 0 }}>✦</span> {f}
                        </li>
                      ))}
                    </ul>

                    {amount > 0 && tier.razorpay_plan_id ? (
                      <button
                        className={isCurrent ? 'btn-secondary' : 'btn-primary'}
                        disabled={isCurrent || !!paying}
                        onClick={() => handleSubscribe(tier)}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                      >
                        {isLoading && <span className="spinner" style={{ width: 14, height: 14 }} />}
                        {isCurrent ? 'Current Plan' : isLoading ? 'Opening…' : 'Subscribe'}
                      </button>
                    ) : (
                      <button className="btn-secondary" disabled style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        {isCurrent ? 'Current Plan' : amount > 0 ? 'Unavailable' : 'Free Tier'}
                      </button>
                    )}
                  </div>
                );
              })}
          </div>

          {/* Enterprise: full-width landscape block below the tier grid */}
          <div
            className="card"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 24, padding: '24px 28px', marginBottom: 20 }}
          >
            <div style={{ flex: '1 1 220px', minWidth: 200 }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 6 }}>Enterprise</h3>
              <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>Custom pricing</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2 }}>Custom storage &amp; limits</div>
            </div>

            <p style={{ flex: '2 1 320px', margin: 0, fontSize: '0.9rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
              Need custom storage limits, white-glove onboarding, or a dedicated account manager? Contact us for a bespoke enterprise plan.
            </p>

            <a href="mailto:sales@epaper-cms.com?subject=Enterprise Custom Quote Request" style={{ textDecoration: 'none', flex: '0 0 auto' }}>
              <button
                className="btn-primary"
                style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '12px 32px' }}
              >
                Contact Us
              </button>
            </a>
          </div>

          {/* Info note */}
          <div style={{ marginTop: 24, padding: '14px 18px', background: 'rgba(99,102,241,0.06)',
            borderRadius: 8, fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Payments are processed by Razorpay. An e-mandate (NACH/UPI Autopay) will be registered
            so future renewals are charged automatically.
          </div>
        </div>
      )}
    </div>
  );
}

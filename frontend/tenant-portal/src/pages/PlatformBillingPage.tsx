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

function formatAmount(paise: number, period: string): string {
  const inr = paise / 100;
  const formatted = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(inr);
  return `${formatted}/${period === 'yearly' ? 'yr' : 'mo'}`;
}

export function PlatformBillingPage({ slug, token, orgName = '', email = '' }: PlatformBillingPageProps) {
  const [status, setStatus]       = useState<any>(null);
  const [plans, setPlans]         = useState<RazorpayPlan[]>([]);
  const [loading, setLoading]     = useState(true);
  const [paying, setPaying]       = useState<string | null>(null); // plan_id being paid
  const [error, setError]         = useState('');
  const [successMsg, setSuccess]  = useState('');

  // Load billing status + live plans from Razorpay Dashboard in parallel.
  useEffect(() => {
    Promise.all([
      portalApi.getPlatformBillingStatus(slug, token),
      portalApi.getPlatformPlans(token),
    ]).then(([statusRes, plansRes]) => {
      if (statusRes.ok && statusRes.data) setStatus(statusRes.data);
      else setError(statusRes.error?.message || 'Failed to load billing status');

      if (plansRes.ok && plansRes.data) {
        // Razorpay /v1/plans returns { entity: 'collection', items: [...] }
        const items: RazorpayPlan[] = plansRes.data.items ?? [];
        setPlans(items);
      }
      setLoading(false);
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

  const handleSubscribe = useCallback(async (plan: RazorpayPlan) => {
    setError('');
    setSuccess('');
    setPaying(plan.id);
    await openCheckout(plan.id, plan.item.name);
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

          {plans.length === 0 ? (
            <div style={{ background: 'rgba(99,102,241,0.05)', border: '1px dashed var(--color-border)',
              borderRadius: 12, padding: '32px 24px', textAlign: 'center', color: 'var(--color-text-secondary)', marginBottom: 20 }}>
              <p style={{ marginBottom: 8 }}>No plans have been configured yet.</p>
              <p style={{ fontSize: '0.85rem' }}>A superadmin needs to create subscription plans in the Razorpay Dashboard first.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 20 }}>
              {plans.map((plan) => {
                const isCurrentPlan = status?.has_subscription && status?.razorpay_status === 'active' && status?.plan?.toLowerCase() === plan.item.name.toLowerCase();
                const isLoading = Boolean(paying) && paying === plan.id;
                const amount = plan.item.unit_amount ?? plan.item.amount;

                return (
                  <div
                    key={plan.id}
                    className="card"
                    style={{ display: 'flex', flexDirection: 'column', padding: '28px 24px',
                      border: isCurrentPlan ? '1px solid var(--color-brand-primary)' : undefined }}
                  >
                    <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8,
                      color: isCurrentPlan ? 'var(--color-brand-primary)' : undefined }}>
                      {plan.item.name}
                    </h3>

                    <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>
                      {formatAmount(amount, plan.period)}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 16, textTransform: 'capitalize' }}>
                      Billed {plan.period} · auto-debit via mandate
                    </div>

                    {plan.item.description && (
                      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 20, flex: 1 }}>
                        {plan.item.description}
                      </p>
                    )}

                    <button
                      className={isCurrentPlan ? 'btn-secondary' : 'btn-primary'}
                      disabled={isCurrentPlan || !!paying}
                      onClick={() => handleSubscribe(plan)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                    >
                      {isLoading && <span className="spinner" style={{ width: 14, height: 14 }} />}
                      {isCurrentPlan ? 'Current Plan' : isLoading ? 'Opening…' : 'Subscribe'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Custom Enterprise Card (Always visible) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20 }}>
            <div
              className="card"
              style={{ display: 'flex', flexDirection: 'column', padding: '28px 24px' }}
            >
              <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: 8 }}>
                Enterprise (Contact Us)
              </h3>

              <div style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 4 }}>
                Price: Custom
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 16, textTransform: 'capitalize' }}>
                Storage: Custom
              </div>

              <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginBottom: 20, flex: 1 }}>
                Need custom storage limits, white-glove onboarding, or a dedicated account manager? Contact us for a bespoke enterprise plan.
              </p>

              <a href="mailto:sales@epaper-cms.com?subject=Enterprise Custom Quote Request" style={{ textDecoration: 'none' }}>
                <button
                  className="btn-secondary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                >
                  Contact Us
                </button>
              </a>
            </div>
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

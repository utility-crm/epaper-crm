import React, { useState, useEffect } from 'react';
import { portalApi } from '../lib/api';

interface BillingConfigPageProps {
  slug: string;
  token: string;
}

export function BillingConfigPage({ slug, token }: BillingConfigPageProps) {
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [existing, setExisting] = useState<{ key_id: string; updated_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    portalApi.getRazorpayConfig(slug, token).then(res => {
      if (res.ok && res.data) setExisting(res.data);
      setLoading(false);
    });
  }, [slug, token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    if (!keyId || !keySecret) { setError('Key ID and Key Secret are required'); return; }
    setSaving(true);
    try {
      const res = await portalApi.saveRazorpayConfig(slug, { key_id: keyId, key_secret: keySecret, webhook_secret: webhookSecret || undefined }, token);
      if (res.ok) {
        setSuccess(true);
        setKeySecret('');
        setWebhookSecret('');
        setExisting({ key_id: keyId, updated_at: new Date().toISOString() });
      } else {
        setError(res.error?.message ?? 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>Billing Configuration</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>Configure Razorpay to accept reader subscriptions</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : (
        <div style={{ maxWidth: 540 }}>
          {existing && (
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
              <div style={{ fontWeight: 600, color: 'var(--color-success)', marginBottom: 6 }}>✓ Razorpay Connected</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                Key ID: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{existing.key_id}</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                Last updated: {new Date(existing.updated_at).toLocaleString()}
              </div>
            </div>
          )}

          <form onSubmit={handleSave} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: 32 }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 4 }}>
              {existing ? 'Update Credentials' : 'Connect Razorpay'}
            </h2>

            <div>
              <label className="label">Razorpay Key ID</label>
              <input className="input" required value={keyId} onChange={e => setKeyId(e.target.value)}
                placeholder="rzp_live_xxxxxxxxxxxx" style={{ fontFamily: 'var(--font-mono)' }} />
            </div>

            <div>
              <label className="label">Razorpay Key Secret</label>
              <input className="input" type="password" required value={keySecret} onChange={e => setKeySecret(e.target.value)}
                placeholder="Enter your key secret" />
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                Stored encrypted at rest using AES-256-GCM. Never exposed in plain text.
              </p>
            </div>

            <div>
              <label className="label">Webhook Secret (optional)</label>
              <input className="input" type="password" value={webhookSecret} onChange={e => setWebhookSecret(e.target.value)}
                placeholder="From Razorpay dashboard → Webhooks" />
            </div>

            {error && (
              <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8, padding: '10px 14px', color: 'var(--color-danger)', fontSize: '0.875rem' }}>
                {error}
              </div>
            )}

            {success && (
              <div style={{ background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: 8, padding: '10px 14px', color: 'var(--color-success)', fontSize: '0.875rem' }}>
                Credentials saved successfully!
              </div>
            )}

            <button className="btn-primary" type="submit" disabled={saving} style={{ alignSelf: 'flex-start', padding: '10px 28px' }}>
              {saving ? 'Saving…' : existing ? 'Update Credentials' : 'Save Credentials'}
            </button>
          </form>

          <div className="card" style={{ marginTop: 20, padding: '18px 24px' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: 10 }}>Setup Checklist</h3>
            {[
              'Create a Razorpay account at razorpay.com',
              'Go to Settings → API Keys → Generate Key Pair',
              'Set up a webhook pointing to your tenant webhook URL',
              'Create monthly/annual plans in Razorpay Dashboard',
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                <span style={{ color: 'var(--color-brand-primary)', fontWeight: 600 }}>{i + 1}.</span>
                {s}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

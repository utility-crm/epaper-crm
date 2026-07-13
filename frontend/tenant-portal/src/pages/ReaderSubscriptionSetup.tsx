import React, { useState, useEffect } from 'react';
import { portalApi, API_BASE_URL } from '../lib/api';

interface ReaderSubscriptionSetupProps {
  slug: string;
  token: string;
}

export function ReaderSubscriptionSetup({ slug, token }: ReaderSubscriptionSetupProps) {
  const [keyId, setKeyId] = useState('');
  const [keySecret, setKeySecret] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');
  const [processRefunds, setProcessRefunds] = useState(false);
  const [refundWindowDays, setRefundWindowDays] = useState('7');
  const [supportEmail, setSupportEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [existing, setExisting] = useState<{ key_id: string; webhook_configured: boolean; process_refunds: boolean; updated_at: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [generatedSecret, setGeneratedSecret] = useState('');
  const [rotating, setRotating] = useState(false);

  const webhookUrl = `${API_BASE_URL}/api/billing/tenant/${slug}/webhook`;

  useEffect(() => {
    portalApi.getRazorpayConfig(slug, token).then(res => {
      if (res.ok && res.data) {
        setExisting(res.data);
        setProcessRefunds(!!res.data.process_refunds);
        if (res.data.refund_window_days != null) setRefundWindowDays(String(res.data.refund_window_days));
        if (res.data.support_email) setSupportEmail(res.data.support_email);
        if (res.data.display_name) setDisplayName(res.data.display_name);
      }
      setLoading(false);
    });
  }, [slug, token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setGeneratedSecret('');
    if (!keyId || !keySecret) { setError('Key ID and Key Secret are required'); return; }
    setSaving(true);
    try {
      const res = await portalApi.saveRazorpayConfig(slug, {
        key_id: keyId, key_secret: keySecret,
        webhook_secret: webhookSecret || undefined,
        process_refunds: processRefunds,
        refund_window_days: parseInt(refundWindowDays, 10) || 0,
        support_email: supportEmail || undefined,
        display_name: displayName || undefined,
      }, token);
      if (res.ok) {
        setSuccess(true);
        setKeySecret('');
        setWebhookSecret('');
        if (res.data?.webhook_secret) setGeneratedSecret(res.data.webhook_secret);
        setExisting({ key_id: keyId, webhook_configured: true, process_refunds: processRefunds, updated_at: new Date().toISOString() });
      } else {
        setError(res.error?.message ?? 'Failed to save');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleRotate = async () => {
    if (!window.confirm('Generate a new webhook secret? You must paste the new value into your Razorpay dashboard, or webhook delivery will fail.')) return;
    setRotating(true);
    setError('');
    const res = await portalApi.rotateWebhookSecret(slug, token);
    setRotating(false);
    if (res.ok && res.data?.webhook_secret) {
      setGeneratedSecret(res.data.webhook_secret);
    } else {
      setError(res.error?.message ?? 'Failed to rotate secret');
    }
  };

  const copy = (text: string) => { navigator.clipboard?.writeText(text); };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>Payment Setup</h1>
        <p style={{ color: 'var(--color-text-secondary)' }}>Configure Razorpay to accept reader subscriptions</p>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : (
        <div style={{ maxWidth: 620 }}>
          {existing && (
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
              borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
              <div style={{ fontWeight: 600, color: 'var(--color-success)', marginBottom: 6 }}>✓ Razorpay Connected</div>
              <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                Key ID: <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>{existing.key_id}</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                Webhook secret: {existing.webhook_configured ? 'configured' : 'not set'} · Last updated: {new Date(existing.updated_at).toLocaleString()}
              </div>
            </div>
          )}

          {generatedSecret && (
            <div style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid var(--color-brand-primary)',
              borderRadius: 12, padding: '16px 20px', marginBottom: 24 }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>Your webhook signing secret (shown once)</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', wordBreak: 'break-all',
                  background: 'var(--color-bg-alt)', padding: '8px 10px', borderRadius: 6 }}>{generatedSecret}</code>
                <button className="btn-secondary" type="button" onClick={() => copy(generatedSecret)} style={{ whiteSpace: 'nowrap' }}>Copy</button>
              </div>
              <p style={{ fontSize: '0.78rem', color: 'var(--color-danger)', marginTop: 8 }}>
                Paste this into Razorpay → Webhooks → Secret now. It won't be shown again — use Rotate to generate a new one.
              </p>
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
                placeholder="Leave blank to auto-generate a secure secret" />
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
                Leave blank and we'll generate a strong secret for you to paste into Razorpay.
              </p>
            </div>

            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: '0.875rem', cursor: 'pointer' }}>
              <input type="checkbox" checked={processRefunds} onChange={e => setProcessRefunds(e.target.checked)} style={{ marginTop: 3 }} />
              <span>
                <strong>We process refunds on cancellation.</strong>
                <span style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.8rem', marginTop: 2 }}>
                  When ON, cancelling a reader's subscription revokes access immediately. When OFF, the reader keeps
                  access until the end of the period they paid for.
                </span>
              </span>
            </label>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Refunds &amp; reader emails</div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Refund window (days)</label>
                <input className="input" type="number" min={0} value={refundWindowDays} onChange={e => setRefundWindowDays(e.target.value)}
                  style={{ maxWidth: 160 }} />
                <span style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.78rem', marginTop: 2 }}>
                  Reader refund requests inside this many days of purchase are flagged as within policy. You still approve each one manually.
                </span>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Publication name (email “from”)</label>
                <input className="input" value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. Local Press" />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Support email (reader replies go here)</label>
                <input className="input" type="email" value={supportEmail} onChange={e => setSupportEmail(e.target.value)} placeholder="support@yourpublication.com" />
                <span style={{ display: 'block', color: 'var(--color-text-muted)', fontSize: '0.78rem', marginTop: 2 }}>
                  Refund emails are sent from the platform’s domain, shown as your publication name, with replies routed to this address.
                </span>
              </div>
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

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn-primary" type="submit" disabled={saving} style={{ padding: '10px 28px' }}>
                {saving ? 'Saving…' : existing ? 'Update Credentials' : 'Save Credentials'}
              </button>
              {existing?.webhook_configured && (
                <button className="btn-secondary" type="button" onClick={handleRotate} disabled={rotating} style={{ padding: '10px 20px' }}>
                  {rotating ? 'Rotating…' : 'Rotate Webhook Secret'}
                </button>
              )}
            </div>
          </form>

          {/* Webhook endpoint + setup guide */}
          <div className="card" style={{ marginTop: 20, padding: '20px 24px' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, marginBottom: 12 }}>Webhook Setup</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 8 }}>
              In Razorpay Dashboard → Settings → Webhooks → Add New Webhook, use this URL:
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}>
              <code style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: '0.8rem', wordBreak: 'break-all',
                background: 'var(--color-bg-alt)', padding: '8px 10px', borderRadius: 6 }}>{webhookUrl}</code>
              <button className="btn-secondary" type="button" onClick={() => copy(webhookUrl)} style={{ whiteSpace: 'nowrap' }}>Copy</button>
            </div>
            {[
              'Create a Razorpay account and switch to Live/Test mode as needed.',
              'Settings → API Keys → Generate Key Pair, then paste the Key ID + Secret above.',
              'Settings → Webhooks → Add New Webhook: paste the URL above.',
              'Set the webhook Secret to the value generated when you save credentials (shown once).',
              'Select events: subscription.charged, subscription.cancelled, subscription.halted, payment.captured.',
              'Create your reader plans under the Plans section once payments are connected.',
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                <span style={{ color: 'var(--color-brand-primary)', fontWeight: 600 }}>{i + 1}.</span>
                {s}
              </div>
            ))}
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 10 }}>
              Note: rotating the secret requires updating it in Razorpay too, so rotation is manual by design —
              automatic rotation would break delivery until the dashboard is updated.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

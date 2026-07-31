import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { crmApi as api } from '../lib/api';

interface TenantRow {
  id: string; slug: string; name: string; email: string; plan: string; status: string;
  razorpay_sub_id: string | null; razorpay_plan_id: string | null;
  manual_since: string | null; manual_until: string | null;
  manual_granted_by: string | null; manual_note: string | null;
}

interface Tier { id: string; name: string; }

export function TenantSubscriptionPage() {
  const { slug } = useParams<{ slug: string }>();
  const nav = useNavigate();

  const [tenant, setTenant] = useState<TenantRow | null>(null);
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showGrant, setShowGrant] = useState(false);
  const [plan, setPlan] = useState('');
  const [startAt, setStartAt] = useState('');
  const [endAt, setEndAt] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!slug) return;
    (async () => {
      const res = await api.getTenantSubscription(slug);
      if (res.ok && res.data) {
        setTenant(res.data.tenant);
        setTiers(res.data.tiers ?? []);
      } else {
        setError(res.error?.message ?? 'Failed to load tenant subscription');
      }
      setLoading(false);
    })();
  }, [slug]);

  const openGrant = () => {
    setShowGrant(true);
    setPlan(tenant?.plan === 'Free' ? '' : tenant?.plan ?? '');
    setStartAt(''); setEndAt(''); setNote('');
    setError('');
  };

  const submitGrant = async () => {
    if (!slug || !tenant) return;
    if (!plan.trim()) { setError('Plan is required'); return; }
    if (!endAt.trim()) { setError('End date is required'); return; }
    setSaving(true); setError('');
    const res = await api.grantTenantSubscription(slug, {
      plan: plan.trim(),
      start_at: startAt.trim() || undefined,
      end_at: endAt.trim(),
      note: note.trim() || undefined
    });
    setSaving(false);
    if (res.ok && res.data) {
      setTenant(res.data);
      setNotice('Manual subscription granted.');
      setShowGrant(false);
    } else {
      setError(res.error?.message ?? 'Could not grant subscription.');
    }
  };

  const extend = async () => {
    if (!slug || !tenant || !tenant.manual_until) return;
    const newEnd = prompt('New end date/time (UTC, YYYY-MM-DDTHH:MM):', tenant.manual_until.slice(0, 16));
    if (!newEnd) return;
    setSaving(true); setError('');
    const res = await api.patchTenantSubscription(slug, { end_at: newEnd.trim() });
    setSaving(false);
    if (res.ok && res.data) {
      setTenant(res.data);
      setNotice('Subscription extended.');
    } else {
      setError(res.error?.message ?? 'Could not extend.');
    }
  };

  const deactivate = async () => {
    if (!slug || !tenant || !tenant.manual_until) return;
    if (!confirm(`Deactivate ${tenant.slug}'s manual subscription now? Plan becomes Free.`)) return;
    setSaving(true); setError('');
    const res = await api.patchTenantSubscription(slug, { deactivate: true });
    setSaving(false);
    if (res.ok && res.data) {
      setTenant(res.data);
      setNotice('Subscription deactivated.');
    } else {
      setError(res.error?.message ?? 'Could not deactivate.');
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>;
  if (!tenant) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Tenant not found.</div>;

  const now = new Date();
  const expired = tenant.manual_until && new Date(tenant.manual_until) <= now;

  return (
    <div>
      <button onClick={() => nav(-1)} style={{ background: 'none', border: 'none', color: 'var(--color-text-secondary)', cursor: 'pointer', fontSize: '0.9rem', marginBottom: 12 }}>
        ← Back
      </button>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 6 }}>Publisher Subscription — {tenant.slug}</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 24 }}>
        Manual subscription grants for publications paying offline (cheque, bank transfer, enterprise contract).
      </p>

      {notice && <div style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{notice}</div>}
      {error && !showGrant && <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      <div style={{ border: '1px solid var(--color-border)', borderRadius: 12, padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4 }}>Plan</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>{tenant.plan}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4 }}>Status</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 600 }}>{tenant.status}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4 }}>Razorpay Subscription</div>
            <div style={{ fontSize: '0.9rem' }}>{tenant.razorpay_sub_id ?? '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4 }}>Manual Grant</div>
            <div style={{ fontSize: '0.9rem' }}>{tenant.manual_until ? 'Active' : '—'}</div>
          </div>
        </div>

        {tenant.manual_until && (
          <div style={{ marginTop: 16, padding: 12, background: expired ? 'rgba(220,38,38,0.05)' : 'rgba(124,58,237,0.05)', border: `1px solid ${expired ? 'rgba(220,38,38,0.2)' : 'rgba(124,58,237,0.2)'}`, borderRadius: 8 }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 4 }}>Manual Subscription Window</div>
            <div style={{ fontSize: '0.9rem', marginBottom: 2 }}>
              {tenant.manual_since ? new Date(tenant.manual_since).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
              {' → '}
              <strong>{new Date(tenant.manual_until).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })} UTC</strong>
              {expired && <span style={{ color: '#dc2626', marginLeft: 8 }}>(expired)</span>}
            </div>
            {tenant.manual_granted_by && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>Granted by {tenant.manual_granted_by}</div>}
            {tenant.manual_note && <div style={{ fontSize: '0.85rem', marginTop: 6, fontStyle: 'italic' }}>"{tenant.manual_note}"</div>}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        {tenant.razorpay_sub_id ? (
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>Manual grants blocked while Razorpay mandate is active. Cancel the mandate first.</div>
        ) : (
          <>
            <button className="btn-primary" onClick={openGrant} disabled={saving}>{tenant.manual_until ? 'Grant / Reactivate' : 'Grant manual subscription'}</button>
            {tenant.manual_until && !expired && (
              <>
                <button className="btn-secondary" onClick={extend} disabled={saving}>Extend</button>
                <button className="btn-secondary" onClick={deactivate} disabled={saving} style={{ color: '#dc2626', borderColor: '#dc2626' }}>Deactivate now</button>
              </>
            )}
          </>
        )}
      </div>

      {showGrant && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => !saving && setShowGrant(false)}>
          <div style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 24, width: 480, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 16 }}>Grant manual subscription — {tenant.slug}</h2>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Plan *</label>
            <select value={plan} onChange={(e) => setPlan(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', marginBottom: 12 }}>
              <option value="">Select a tier</option>
              {tiers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Start (UTC, leave blank = now)</label>
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', marginBottom: 12 }} />
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>End (UTC) *</label>
            <input type="datetime-local" value={endAt} onChange={(e) => setEndAt(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', marginBottom: 12 }} />
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Note</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Why this grant (internal)"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', marginBottom: 12, resize: 'vertical' }} />
            {error && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-secondary" disabled={saving} onClick={() => setShowGrant(false)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={submitGrant}>{saving ? 'Granting…' : 'Grant'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

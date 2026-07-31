import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { crmApi as api } from '../lib/api';
import { ConfirmModal } from '../components/ConfirmModal';

/**
 * `<input type="datetime-local">` yields a bare wall-clock string ('2026-08-01T14:00')
 * with no zone, which the browser parses as the operator's *local* time. The worker pins
 * bare values to UTC, so posting the raw value would silently shift the window by the
 * operator's offset — 14:00 IST would be stored as 14:00Z. Send an explicit instant.
 */
function localToUtcIso(v: string): string | null {
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/** Inverse: stored UTC instant → the local wall-clock string the widget expects. */
function utcIsoToLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const UTC_FMT = { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' } as const;

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
  const [showExtend, setShowExtend] = useState(false);
  const [extendAt, setExtendAt] = useState('');
  const [showDeactivate, setShowDeactivate] = useState(false);

  const planRef = useRef<HTMLSelectElement>(null);
  const extendRef = useRef<HTMLInputElement>(null);

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

  // Escape closes any open dialog, but never mid-request: dismissing while the POST/PATCH
  // is in flight would hide the outcome of a change that still lands.
  useEffect(() => {
    if (!showGrant && !showExtend && !showDeactivate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || saving) return;
      setShowGrant(false);
      setShowExtend(false);
      setShowDeactivate(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showGrant, showExtend, showDeactivate, saving]);

  // Move focus into the dialog on open so keyboard and screen-reader users land on the first
  // field instead of staying behind the overlay.
  useEffect(() => { if (showGrant) planRef.current?.focus(); }, [showGrant]);
  useEffect(() => { if (showExtend) extendRef.current?.focus(); }, [showExtend]);

  const openGrant = () => {
    setShowGrant(true);
    // Preselect the tier whose canonical name matches the stored plan, case-insensitively:
    // tenants.plan may differ in case from platform_tiers.name, and a mismatched <select>
    // value renders as blank, which reads as "no plan" rather than "same plan".
    const match = tiers.find(t => t.name.toLowerCase() === (tenant?.plan ?? '').toLowerCase());
    setPlan(tenant?.plan?.toLowerCase() === 'free' ? '' : match?.name ?? '');
    setStartAt(''); setEndAt(''); setNote('');
    setError('');
  };

  const submitGrant = async () => {
    if (!slug || !tenant) return;
    if (!plan.trim()) { setError('Plan is required'); return; }
    if (!endAt.trim()) { setError('End date is required'); return; }
    const endIso = localToUtcIso(endAt);
    if (!endIso) { setError('End date is not a valid date/time'); return; }
    const startIso = startAt.trim() ? localToUtcIso(startAt) : undefined;
    if (startAt.trim() && !startIso) { setError('Start date is not a valid date/time'); return; }
    setSaving(true); setError(''); setNotice('');
    const res = await api.grantTenantSubscription(slug, {
      plan: plan.trim(),
      start_at: startIso ?? undefined,
      end_at: endIso,
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

  const openExtend = () => {
    if (!tenant?.manual_until) return;
    setExtendAt(utcIsoToLocalInput(tenant.manual_until));
    setError('');
    setShowExtend(true);
  };

  const submitExtend = async () => {
    if (!slug || !tenant || !extendAt.trim()) { setError('Pick a new end date/time'); return; }
    const endIso = localToUtcIso(extendAt);
    if (!endIso) { setError('End date is not a valid date/time'); return; }
    setSaving(true); setError(''); setNotice('');
    const res = await api.patchTenantSubscription(slug, { end_at: endIso });
    setSaving(false);
    if (res.ok && res.data) {
      setTenant(res.data);
      setNotice('Subscription extended.');
      setShowExtend(false);
    } else {
      setError(res.error?.message ?? 'Could not extend.');
    }
  };

  const deactivate = async () => {
    if (!slug || !tenant || !tenant.manual_until) return;
    setSaving(true); setError(''); setNotice('');
    const res = await api.patchTenantSubscription(slug, { deactivate: true });
    setSaving(false);
    setShowDeactivate(false);
    if (res.ok && res.data) {
      setTenant(res.data);
      setNotice('Subscription deactivated.');
    } else {
      setError(res.error?.message ?? 'Could not deactivate.');
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>;
  // Error before the null fallback: a failed load leaves tenant null, and "Tenant not found"
  // would misreport a network or auth failure as a missing publication.
  if (error && !tenant) return (
    <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', padding: '10px 14px', borderRadius: 8 }}>{error}</div>
  );
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
              {tenant.manual_since ? new Date(tenant.manual_since).toLocaleString('en-GB', UTC_FMT) : '—'}
              {' → '}
              <strong>{new Date(tenant.manual_until).toLocaleString('en-GB', UTC_FMT)} UTC</strong>
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
                <button className="btn-secondary" onClick={openExtend} disabled={saving}>Extend</button>
                <button className="btn-secondary" onClick={() => setShowDeactivate(true)} disabled={saving} style={{ color: '#dc2626', borderColor: '#dc2626' }}>Deactivate now</button>
              </>
            )}
          </>
        )}
      </div>

      {showGrant && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => !saving && setShowGrant(false)}>
          <div role="dialog" aria-modal="true" aria-label="Grant manual subscription" style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 24, width: 480, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 16 }}>Grant manual subscription — {tenant.slug}</h2>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Plan *</label>
            <select ref={planRef} value={plan} onChange={(e) => setPlan(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', marginBottom: 12 }}>
              <option value="">Select a tier</option>
              {tiers.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Start (your local time — blank = now)</label>
            <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', marginBottom: 12 }} />
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>End (your local time) *</label>
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

      {showExtend && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => !saving && setShowExtend(false)}>
          <div role="dialog" aria-modal="true" aria-label="Extend manual subscription" style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 24, width: 420, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 16 }}>Extend subscription — {tenant.slug}</h2>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>New end (your local time) *</label>
            <input ref={extendRef} type="datetime-local" value={extendAt} onChange={(e) => setExtendAt(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', marginBottom: 12 }} />
            {error && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-secondary" disabled={saving} onClick={() => setShowExtend(false)}>Cancel</button>
              <button className="btn-primary" disabled={saving} onClick={submitExtend}>{saving ? 'Saving…' : 'Extend'}</button>
            </div>
          </div>
        </div>
      )}

      {showDeactivate && (
        <ConfirmModal
          title="Deactivate manual subscription"
          message={`End ${tenant.slug}'s manual grant now? The publication drops to its Razorpay state (or Free) immediately.`}
          confirmLabel="Deactivate"
          loading={saving}
          onConfirm={deactivate}
          onCancel={() => setShowDeactivate(false)}
        />
      )}
    </div>
  );
}

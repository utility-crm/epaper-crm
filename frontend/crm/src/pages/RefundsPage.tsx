import { useEffect, useState, useCallback } from 'react';
import { crmApi as api } from '../lib/api';

interface RefundRow {
  id: string;
  slug: string;
  tenant_email: string | null;
  payment_id: string | null;
  reason: string | null;
  status: string;
  refund_amount_paise: number | null;
  suggested_amount_paise: number | null;
  kind: string | null;
  staff_message: string | null;
  created_at: string;
  processed_at: string | null;
}

const STATUS_COLOR: Record<string, string> = {
  requested: '#d97706',
  refunded: '#16a34a',
  rejected: '#dc2626',
};

export function RefundsPage() {
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [active, setActive] = useState<RefundRow | null>(null);
  const [amountRupees, setAmountRupees] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await api.listPlatformRefundRequests();
    if (res.ok && res.data) setRows(res.data.items ?? []);
    else setError(res.error?.message ?? 'Failed to load refund requests');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openProcess = (row: RefundRow) => {
    // Autofill the suggested max (e.g. the superseded plan's charge on a plan change).
    setActive(row);
    setAmountRupees(row.suggested_amount_paise != null ? (row.suggested_amount_paise / 100).toFixed(2) : '');
    setMessage(''); setError('');
  };

  const submit = async (action: 'approve' | 'reject') => {
    if (!active) return;
    setSaving(true); setError('');
    const amount_paise = action === 'approve' && amountRupees.trim()
      ? Math.round(parseFloat(amountRupees) * 100)
      : undefined;
    if (action === 'approve' && amountRupees.trim() && (!Number.isFinite(amount_paise!) || amount_paise! <= 0)) {
      setSaving(false); setError('Enter a valid amount, or leave blank for a full refund.'); return;
    }
    const res = await api.processPlatformRefundRequest(active.id, { action, amount_paise, message: message.trim() || undefined });
    setSaving(false);
    if (res.ok) {
      setNotice(action === 'approve' ? 'Refund processed and tenant notified.' : 'Request rejected and tenant notified.');
      setActive(null); load();
    } else {
      setError(res.error?.message ?? 'Could not process the request.');
    }
  };

  const fmt = (paise: number | null) => paise != null ? `₹${(paise / 100).toFixed(2)}` : '—';

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: 6 }}>Refund Requests</h1>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: 24 }}>
        Publication → Platform refund requests. Approve with a custom amount per portal guidelines, or reject. The tenant is emailed either way.
      </p>

      {notice && <div style={{ background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)', color: '#16a34a', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{notice}</div>}
      {error && !active && <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', padding: '10px 14px', borderRadius: 8, marginBottom: 16 }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>No refund requests yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((r) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, border: '1px solid var(--color-border)', borderRadius: 8, padding: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <strong>{r.slug}</strong>
                  <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: STATUS_COLOR[r.status] ?? 'inherit' }}>{r.status}</span>
                  {r.kind === 'plan_change' && (
                    <span style={{ fontSize: '0.68rem', textTransform: 'uppercase', color: '#7c3aed', border: '1px solid #7c3aed55', borderRadius: 6, padding: '1px 6px' }}>plan change</span>
                  )}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{r.tenant_email ?? '—'}</div>
                {r.reason && <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 2 }}>“{r.reason}”</div>}
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
                  {new Date(r.created_at).toLocaleDateString()}
                  {r.status !== 'requested' && r.refund_amount_paise != null && ` · Refunded ${fmt(r.refund_amount_paise)}`}
                </div>
              </div>
              {r.status === 'requested' && (
                <button className="btn-primary" style={{ fontSize: '0.85rem', padding: '6px 14px' }} onClick={() => openProcess(r)}>Review</button>
              )}
            </div>
          ))}
        </div>
      )}

      {active && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => !saving && setActive(null)}>
          <div style={{ background: 'var(--color-bg-base)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 24, width: 440, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: 16 }}>Process refund — {active.slug}</h2>
            <div style={{ background: 'var(--color-bg-elev, rgba(255,255,255,0.03))', borderRadius: 8, padding: 12, fontSize: '0.85rem', marginBottom: 16 }}>
              <div><span style={{ color: 'var(--color-text-muted)' }}>Tenant:</span> {active.tenant_email ?? '—'}</div>
              {active.reason && <div style={{ marginTop: 4 }}><span style={{ color: 'var(--color-text-muted)' }}>Reason:</span> {active.reason}</div>}
              <div style={{ marginTop: 4 }}><span style={{ color: 'var(--color-text-muted)' }}>Payment:</span> {active.payment_id ?? 'none on file'}</div>
              {active.kind === 'plan_change' && (
                <div style={{ marginTop: 4, color: '#7c3aed' }}>Plan change — refund basis is the superseded plan's charge.</div>
              )}
            </div>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Refund amount (₹){active.suggested_amount_paise != null ? ` — max ₹${(active.suggested_amount_paise / 100).toFixed(2)}` : ''}</label>
            <input value={amountRupees} onChange={(e) => setAmountRupees(e.target.value)} inputMode="decimal" placeholder="Blank = full refund"
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', marginBottom: 12 }} />
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4 }}>Message to tenant</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Explain the outcome (included in the email)."
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit', marginBottom: 12, resize: 'vertical' }} />
            {error && <div style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-secondary" disabled={saving} onClick={() => submit('reject')} style={{ color: '#dc2626', borderColor: '#dc2626' }}>Reject</button>
              <button className="btn-primary" disabled={saving} onClick={() => submit('approve')}>{saving ? 'Processing…' : 'Approve refund'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

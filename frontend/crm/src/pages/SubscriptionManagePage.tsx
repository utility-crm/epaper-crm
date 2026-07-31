import React, { useEffect, useState } from 'react';
import { crmApi } from '../lib/api';

// Superadmin manual-subscription control: open, extend or end reader access outside the
// Razorpay mandate (cash at the counter, cheque, bank transfer, enterprise terms), and
// reactivate a reader whose online subscription lapsed. Writes the same rows the
// publisher portal writes, so a grant made here shows up there immediately.
//
// Datetimes are UTC: `datetime-local` has no zone and the worker pins a bare value to
// UTC rather than guessing, so the inputs are labelled UTC and prefilled from the ISO
// value verbatim.

// ISO -> value a `datetime-local` input accepts, in UTC.
function toLocalInput(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 16) : '';
}

function plusDays(n: number): string {
  return new Date(Date.now() + n * 86400_000).toISOString().slice(0, 16);
}

type Sub = {
  id: string; plan_type: string; status: string;
  current_start: string; current_end: string;
  grant_type: string; granted_by: string | null; grant_note: string | null;
};

export function SubscriptionManagePage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [slug, setSlug] = useState('');
  const [email, setEmail] = useState('');
  const [reader, setReader] = useState<{ id: string; email: string; name: string } | null>(null);
  const [subs, setSubs] = useState<Sub[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Grant form.
  const [startAt, setStartAt] = useState(plusDays(0));
  const [endAt, setEndAt] = useState(plusDays(30));
  const [note, setNote] = useState('');

  useEffect(() => {
    // Active tenants only — a pending or deleted tenant has no reader DB to grant into.
    crmApi.getTenants('active', 1).then(res => {
      if (res.ok && res.data) setTenants(res.data.items ?? []);
    });
  }, []);

  const lookup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!slug || !email) return setMsg({ text: 'Pick a publication and enter a reader email', type: 'error' });
    setBusy(true);
    setMsg({ text: '', type: '' });
    const res = await crmApi.lookupReaderSubscriptions(slug, email.trim());
    if (res.ok && res.data) {
      setReader(res.data.reader);
      setSubs(res.data.items as Sub[]);
      if (!res.data.items.length) setMsg({ text: 'Reader found, no subscriptions yet.', type: 'success' });
    } else {
      setReader(null);
      setSubs([]);
      setMsg({ text: res.error?.message || 'Lookup failed', type: 'error' });
    }
    setBusy(false);
  };

  const grant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reader) return;
    setBusy(true);
    const res = await crmApi.grantSubscription(slug, {
      reader_id: reader.id, start_at: startAt, end_at: endAt, note: note.trim() || undefined,
    });
    setBusy(false);
    if (res.ok) {
      setMsg({ text: 'Access granted. The publisher sees the same row.', type: 'success' });
      setNote('');
      lookup();
    } else {
      setMsg({ text: res.error?.message || 'Grant failed', type: 'error' });
    }
  };

  const patch = async (id: string, body: { end_at?: string; status?: 'active' | 'cancelled' }) => {
    setBusy(true);
    const res = await crmApi.patchSubscription(slug, id, body);
    setBusy(false);
    if (res.ok) { setMsg({ text: 'Subscription updated.', type: 'success' }); lookup(); }
    else setMsg({ text: res.error?.message || 'Update failed', type: 'error' });
  };

  const endNow = (id: string) => {
    if (!window.confirm('End this grant now? The reader loses access on their next page request.')) return;
    patch(id, { status: 'cancelled', end_at: new Date().toISOString() });
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 4 }}>Manual Subscriptions</h1>
      <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: 24 }}>
        Grant, extend or end reader access outside Razorpay — cash, cheque, bank transfer or
        enterprise terms — and reactivate readers whose online subscription lapsed.
      </p>

      {msg.text && (
        <div style={{ padding: 12, borderRadius: 8, marginBottom: 16, fontSize: '0.9rem',
          background: msg.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
          color: msg.type === 'error' ? 'var(--color-danger)' : 'var(--color-success)' }}>
          {msg.text}
        </div>
      )}

      <div className="card" style={{ maxWidth: 700 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Find Reader</h2>
        <form onSubmit={lookup} style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 200px' }}>
            <label className="label">Publication</label>
            <select className="input" value={slug} onChange={e => { setSlug(e.target.value); setReader(null); setSubs([]); }}>
              <option value="">Select…</option>
              {tenants.map(t => <option key={t.slug} value={t.slug}>{t.name} ({t.slug})</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 220px' }}>
            <label className="label">Reader email</label>
            <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="reader@example.com" />
          </div>
          <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Working…' : 'Look Up'}</button>
        </form>
      </div>

      {reader && (
        <>
          <div className="card" style={{ maxWidth: 700, marginTop: 24 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 4 }}>
              Grant / Reactivate — {reader.name || reader.email}
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: 16 }}>
              Times are UTC. A reader with an existing manual grant has that same row extended,
              rather than a second one stacked on top.
            </p>
            <form onSubmit={grant} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label className="label">Start (UTC)</label>
                  <input type="datetime-local" required className="input" value={startAt} onChange={e => setStartAt(e.target.value)} />
                </div>
                <div style={{ flex: '1 1 200px' }}>
                  <label className="label">End (UTC)</label>
                  <input type="datetime-local" required className="input" value={endAt} onChange={e => setEndAt(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Note (why — cash receipt no., cheque, enterprise deal)</label>
                <input type="text" maxLength={500} className="input" value={note} onChange={e => setNote(e.target.value)} />
              </div>
              <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: 'flex-start' }}>
                {busy ? 'Saving…' : 'Grant Access'}
              </button>
            </form>
          </div>

          <div className="card" style={{ maxWidth: 700, marginTop: 24 }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Subscriptions ({subs.length})</h2>
            {subs.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>
                No subscriptions for this reader.
              </div>
            ) : (
              <table style={{ width: '100%', fontSize: '0.875rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: '6px 8px 6px 0' }}>Lane</th>
                    <th style={{ padding: '6px 8px 6px 0' }}>Status</th>
                    <th style={{ padding: '6px 8px 6px 0' }}>Ends (UTC)</th>
                    <th style={{ padding: '6px 8px 6px 0' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {subs.map(s => (
                    <tr key={s.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '10px 8px 10px 0' }}>
                        {s.grant_type === 'manual' ? 'Manual' : 'Razorpay'}
                        {s.grant_note && <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{s.grant_note}</div>}
                      </td>
                      <td style={{ padding: '10px 8px 10px 0' }}>{s.status}</td>
                      <td style={{ padding: '10px 8px 10px 0' }}>
                        {s.grant_type === 'manual' ? (
                          <input type="datetime-local" className="input" style={{ padding: '4px 6px', fontSize: '0.8rem' }}
                            defaultValue={toLocalInput(s.current_end)}
                            onBlur={e => { const v = e.target.value; if (v && v !== toLocalInput(s.current_end)) patch(s.id, { end_at: v }); }} />
                        ) : (
                          // Razorpay dates belong to the mandate — the next charged webhook
                          // would overwrite anything edited here.
                          <span title="Owned by the Razorpay mandate">{s.current_end?.replace('T', ' ').slice(0, 16)}</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 8px 10px 0' }}>
                        {s.grant_type === 'manual' && s.status === 'active' && (
                          <button className="btn-secondary" style={{ fontSize: '0.8rem', padding: '4px 10px' }}
                            disabled={busy} onClick={() => endNow(s.id)}>End Now</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 12 }}>
              Ending a grant stops new page tokens immediately; already-issued page tokens
              stay valid for up to 6 hours.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

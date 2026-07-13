import { useEffect, useState, useCallback } from 'react';
import { crmApi as api } from '../lib/api';

interface EmailEvent {
  id: string;
  resend_email_id: string | null;
  event_type: string;
  recipient: string | null;
  subject: string | null;
  lane: string | null;
  slug: string | null;
  occurred_at: string | null;
  created_at: string;
}

// Resend event types → colour. Failures stand out.
const EVENT_COLOR: Record<string, string> = {
  'email.sent': '#6b7280',
  'email.delivered': '#16a34a',
  'email.delivery_delayed': '#d97706',
  'email.bounced': '#dc2626',
  'email.complained': '#dc2626',
  'email.opened': '#2563eb',
  'email.clicked': '#7c3aed',
};

const LANE_LABEL: Record<string, string> = {
  reader_refund: 'Reader refund',
  platform_refund: 'Platform refund',
};

export function EmailMonitorPage() {
  const [rows, setRows] = useState<EmailEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [laneFilter, setLaneFilter] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await api.listEmailEvents(laneFilter ? { lane: laneFilter } : undefined);
    if (res.ok && res.data) setRows(res.data.items ?? []);
    else setError(res.error?.message ?? 'Failed to load email events');
    setLoading(false);
  }, [laneFilter]);

  useEffect(() => { load(); }, [load]);

  const label = (t: string) => t.replace(/^email\./, '').replace(/_/g, ' ');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Email Monitoring</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>Resend delivery status for refund notifications (both lanes).</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={laneFilter} onChange={(e) => setLaneFilter(e.target.value)}
            style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--color-border)', background: 'transparent', color: 'inherit' }}>
            <option value="">All lanes</option>
            <option value="reader_refund">Reader refund</option>
            <option value="platform_refund">Platform refund</option>
          </select>
          <button className="btn-secondary" onClick={load} style={{ fontSize: '0.85rem' }}>Refresh</button>
        </div>
      </div>

      {error && <div style={{ background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)', color: '#dc2626', padding: '10px 14px', borderRadius: 8, margin: '16px 0' }}>{error}</div>}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>Loading…</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-muted)' }}>No email events yet. They appear once Resend delivers the webhook.</div>
      ) : (
        <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden', marginTop: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-text-muted)', background: 'rgba(255,255,255,0.03)' }}>
                <th style={{ padding: '10px 12px' }}>Status</th>
                <th style={{ padding: '10px 12px' }}>Recipient</th>
                <th style={{ padding: '10px 12px' }}>Subject</th>
                <th style={{ padding: '10px 12px' }}>Lane</th>
                <th style={{ padding: '10px 12px' }}>Publication</th>
                <th style={{ padding: '10px 12px' }}>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ textTransform: 'capitalize', fontWeight: 600, color: EVENT_COLOR[r.event_type] ?? 'inherit' }}>{label(r.event_type)}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>{r.recipient ?? '—'}</td>
                  <td style={{ padding: '10px 12px', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.subject ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{r.lane ? (LANE_LABEL[r.lane] ?? r.lane) : '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{r.slug ?? '—'}</td>
                  <td style={{ padding: '10px 12px', color: 'var(--color-text-muted)' }}>{new Date(r.occurred_at ?? r.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

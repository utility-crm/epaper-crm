import { useEffect, useState, useCallback } from 'react';
import { portalApi } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { ReceiptText } from 'lucide-react';

interface Props { slug: string; token: string; }

interface RefundRow {
  id: string;
  reader_email: string | null;
  reason: string | null;
  status: string;
  payment_id: string | null;
  refund_amount_paise: number | null;
  staff_message: string | null;
  created_at: string;
  processed_at: string | null;
  current_start: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  requested: 'bg-amber-500/15 text-amber-600',
  refunded: 'bg-green-500/15 text-green-600',
  rejected: 'bg-red-500/15 text-red-500',
};

export function RefundsPage({ slug, token }: Props) {
  const [rows, setRows] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Processing dialog state
  const [active, setActive] = useState<RefundRow | null>(null);
  const [amountRupees, setAmountRupees] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await portalApi.listRefundRequests(slug, token);
    if (res.ok && res.data) setRows(res.data.items ?? []);
    else setError(res.error?.message ?? 'Failed to load refund requests');
    setLoading(false);
  }, [slug, token]);

  useEffect(() => { load(); }, [load]);

  const openProcess = (row: RefundRow) => {
    setActive(row);
    setAmountRupees(''); // blank = full refund
    setMessage('');
    setError('');
  };

  const submit = async (action: 'approve' | 'reject') => {
    if (!active) return;
    setSaving(true); setError('');
    const amount_paise = action === 'approve' && amountRupees.trim()
      ? Math.round(parseFloat(amountRupees) * 100)
      : undefined;
    if (action === 'approve' && amountRupees.trim() && (!Number.isFinite(amount_paise!) || amount_paise! <= 0)) {
      setSaving(false); setError('Enter a valid refund amount, or leave blank for a full refund.'); return;
    }
    const res = await portalApi.processRefundRequest(slug, active.id, { action, amount_paise, message: message.trim() || undefined }, token);
    setSaving(false);
    if (res.ok) {
      setNotice(action === 'approve' ? 'Refund processed and reader notified.' : 'Request rejected and reader notified.');
      setActive(null);
      load();
    } else {
      setError(res.error?.message ?? 'Could not process the request.');
    }
  };

  const fmtAmount = (paise: number | null) => paise != null ? `₹${(paise / 100).toFixed(2)}` : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <ReceiptText className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-2xl font-bold">Refund Requests</h1>
      </div>

      {notice && <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-600">{notice}</div>}
      {error && !active && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">{error}</div>}

      <Card>
        <CardHeader>
          <CardTitle>Reader refunds</CardTitle>
          <CardDescription>
            Approve with a custom amount (blank = full) after accounting for usage and your refund policy, or reject. The reader is emailed either way.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-6 text-sm text-muted-foreground">Loading…</div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">No refund requests yet.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{r.reader_email ?? r.id.slice(0, 8)}</span>
                      <Badge className={STATUS_STYLE[r.status] ?? ''}>{r.status}</Badge>
                    </div>
                    {r.reason && <p className="mt-0.5 truncate text-muted-foreground">“{r.reason}”</p>}
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Requested {new Date(r.created_at).toLocaleDateString()}
                      {r.status !== 'requested' && r.refund_amount_paise != null && ` · Refunded ${fmtAmount(r.refund_amount_paise)}`}
                    </p>
                  </div>
                  {r.status === 'requested' && (
                    <Button size="sm" onClick={() => openProcess(r)}>Review</Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!active} onOpenChange={(o) => !o && setActive(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process refund</DialogTitle>
          </DialogHeader>
          {active && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/40 p-3 text-sm">
                <p><span className="text-muted-foreground">Reader:</span> {active.reader_email ?? '—'}</p>
                {active.reason && <p className="mt-1"><span className="text-muted-foreground">Reason:</span> {active.reason}</p>}
                <p className="mt-1"><span className="text-muted-foreground">Payment:</span> {active.payment_id ?? 'none on file'}</p>
              </div>
              <div>
                <Label htmlFor="amt">Refund amount (₹)</Label>
                <Input id="amt" inputMode="decimal" placeholder="Leave blank for full refund" value={amountRupees} onChange={(e) => setAmountRupees(e.target.value)} />
                <p className="mt-1 text-xs text-muted-foreground">Set a partial amount after deducting used period / fees per your policy.</p>
              </div>
              <div>
                <Label htmlFor="msg">Message to reader</Label>
                <Textarea id="msg" rows={3} placeholder="Explain the outcome (included in the email)." value={message} onChange={(e) => setMessage(e.target.value)} />
              </div>
              {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</div>}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={saving} onClick={() => submit('reject')} className="border-red-500/40 text-red-500 hover:bg-red-500/10">Reject</Button>
            <Button disabled={saving} onClick={() => submit('approve')}>{saving ? 'Processing…' : 'Approve refund'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

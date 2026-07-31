import { useEffect, useState, useCallback } from 'react';
import { portalApi } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Users, Plus, Trash2, Ban, BadgeIndianRupee } from 'lucide-react';

interface Props { slug: string; token: string; }

// ISO -> value a `datetime-local` input accepts. The worker pins a bare datetime-local
// to UTC rather than guessing a zone, so these fields are labelled and read as UTC.
const toInput = (iso?: string | null) => (iso ? iso.slice(0, 16) : '');
const plusDays = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 16);

// Same rule as may() in workers/billing-tenant/src/admin-grants.ts — an explicit
// permissions array wins, otherwise role. Only hides the button; the worker still
// decides, so a stale token can't grant anything.
function mayGrant(token: string): boolean {
  try {
    const p = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (Array.isArray(p.permissions)) return p.permissions.includes('grant_subs');
    return p.role === 'owner' || p.role === 'admin';
  } catch { return false; }
}

export function UserManagementPage({ slug, token }: Props) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState('');

  // Manual grant dialog: cash at the counter, cheque, bank transfer, enterprise terms,
  // and reactivating a reader whose online subscription lapsed. Same rows the platform
  // CRM writes, so a grant made either side is visible on both.
  const [grantFor, setGrantFor] = useState<{ id: string; name: string; email: string } | null>(null);
  const [grantSubs, setGrantSubs] = useState<any[]>([]);
  const [grantForm, setGrantForm] = useState({ start_at: plusDays(0), end_at: plusDays(30), note: '' });
  const canGrant = mayGrant(token);

  const load = useCallback(async () => {
    const res = await portalApi.listUsers(slug, token);
    if (res.ok && res.data) setUsers(res.data.items ?? []);
    else setError(res.error?.message ?? 'Failed to load readers');
    setLoading(false);
  }, [slug, token]);

  useEffect(() => { load(); }, [load]);

  const createUser = async () => {
    setError(''); setTempPassword('');
    if (!form.email || !form.name) { setError('Email and name are required'); return; }
    setSaving(true);
    const res = await portalApi.createUser(slug, { email: form.email, name: form.name, password: form.password || undefined }, token);
    setSaving(false);
    if (res.ok) {
      if (res.data?.temp_password) setTempPassword(res.data.temp_password);
      setForm({ email: '', name: '', password: '' });
      setModalOpen(false);
      setNotice('Reader created.');
      load();
    } else {
      setError(res.error?.message ?? 'Failed to create reader');
    }
  };

  const cancelSub = async (id: string) => {
    if (!window.confirm('Cancel this reader’s subscription?')) return;
    const res = await portalApi.cancelUserSubscription(slug, id, token);
    if (res.ok) { setNotice('Subscription cancelled.'); load(); }
    else setError(res.error?.message ?? 'Failed to cancel');
  };

  const removeUser = async (id: string) => {
    if (!window.confirm('Delete this reader account and all their subscriptions? This cannot be undone.')) return;
    const res = await portalApi.deleteUser(slug, id, token);
    if (res.ok) { setNotice('Reader removed.'); load(); }
    else setError(res.error?.message ?? 'Failed to delete');
  };

  const openGrant = async (u: any) => {
    setError(''); setNotice('');
    setGrantFor({ id: u.id, name: u.name, email: u.email });
    setGrantForm({ start_at: plusDays(0), end_at: plusDays(30), note: '' });
    const res = await portalApi.listReaderSubscriptions(slug, u.id, token);
    setGrantSubs(res.ok && res.data ? res.data.items ?? [] : []);
  };

  const refreshGrantSubs = async (readerId: string) => {
    const res = await portalApi.listReaderSubscriptions(slug, readerId, token);
    if (res.ok && res.data) setGrantSubs(res.data.items ?? []);
    load();
  };

  const submitGrant = async () => {
    if (!grantFor) return;
    setSaving(true);
    const res = await portalApi.grantManualSubscription(slug, {
      reader_id: grantFor.id,
      start_at: grantForm.start_at,
      end_at: grantForm.end_at,
      note: grantForm.note.trim() || undefined,
    }, token);
    setSaving(false);
    if (res.ok) { setNotice('Access granted.'); refreshGrantSubs(grantFor.id); }
    else setError(res.error?.message ?? 'Failed to grant access');
  };

  const patchGrant = async (id: string, body: { end_at?: string; status?: 'active' | 'cancelled' }) => {
    if (!grantFor) return;
    const res = await portalApi.patchManualSubscription(slug, id, body, token);
    if (res.ok) { setNotice('Subscription updated.'); refreshGrantSubs(grantFor.id); }
    else setError(res.error?.message ?? 'Failed to update subscription');
  };

  const endGrantNow = (id: string) => {
    if (!window.confirm('End this grant now? The reader loses access on their next page request.')) return;
    patchGrant(id, { status: 'cancelled', end_at: new Date().toISOString() });
  };

  if (loading) return <div className="flex justify-center py-24"><div className="spinner" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl font-700 tracking-tight">User Management</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage reader accounts and cancel subscriptions on their behalf.</p>
        </div>
        <Button onClick={() => { setModalOpen(true); setError(''); }}><Plus className="mr-1.5 h-4 w-4" />Add Reader</Button>
      </div>

      {error && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">{error}</div>}
      {notice && <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-600">{notice}</div>}
      {tempPassword && (
        <div className="rounded-lg border border-primary/40 bg-primary/5 px-4 py-3 text-sm">
          Temporary password (share with the reader, shown once): <code className="font-mono">{tempPassword}</code>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <div><CardTitle>Readers ({users.length})</CardTitle><CardDescription>Accounts registered with this publication.</CardDescription></div>
          </div>
        </CardHeader>
        <CardContent>
          {users.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">No readers yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Name</th>
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Subscription</th>
                    <th className="py-2 pr-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => {
                    const active = u.sub_status === 'active';
                    return (
                      <tr key={u.id} className="border-b border-border/60">
                        <td className="py-3 pr-4 font-medium">{u.name}</td>
                        <td className="py-3 pr-4 text-muted-foreground">{u.email}</td>
                        <td className="py-3 pr-4">
                          {active
                            ? <Badge>Active{u.current_end ? ` · till ${new Date(u.current_end).toLocaleDateString()}` : ''}</Badge>
                            : <Badge variant="muted">{u.sub_status || 'None'}</Badge>}
                        </td>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-1.5">
                            {canGrant && (
                              <Button variant="outline" size="sm" onClick={() => openGrant(u)}>
                                <BadgeIndianRupee className="mr-1 h-3.5 w-3.5" />{active ? 'Extend' : 'Grant'}
                              </Button>
                            )}
                            <Button variant="outline" size="sm" disabled={!active} onClick={() => cancelSub(u.id)}>
                              <Ban className="mr-1 h-3.5 w-3.5" />Cancel
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => removeUser(u.id)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Reader</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Reader name" /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="reader@example.com" /></div>
            <div>
              <Label>Password (optional)</Label>
              <Input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank to auto-generate" />
              <p className="mt-1 text-xs text-muted-foreground">If blank, a temporary password is generated and shown once.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={createUser} disabled={saving}>{saving ? 'Creating…' : 'Create Reader'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!grantFor} onOpenChange={o => { if (!o) setGrantFor(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual Access — {grantFor?.name || grantFor?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-xs text-muted-foreground">
              For payments taken off-platform — cash, cheque, bank transfer, enterprise terms —
              and to reactivate a reader whose online subscription lapsed. Times are UTC.
              An existing manual grant is extended rather than stacked.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start (UTC)</Label>
                <Input type="datetime-local" value={grantForm.start_at} onChange={e => setGrantForm(f => ({ ...f, start_at: e.target.value }))} />
              </div>
              <div>
                <Label>End (UTC)</Label>
                <Input type="datetime-local" value={grantForm.end_at} onChange={e => setGrantForm(f => ({ ...f, end_at: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Note (cash receipt no., cheque, enterprise deal)</Label>
              <Input maxLength={500} value={grantForm.note} onChange={e => setGrantForm(f => ({ ...f, note: e.target.value }))} />
            </div>

            {grantSubs.length > 0 && (
              <div className="rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Lane</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Ends (UTC)</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grantSubs.map(s => (
                      <tr key={s.id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">
                          {s.grant_type === 'manual' ? 'Manual' : 'Razorpay'}
                          {s.grant_note && <div className="text-xs text-muted-foreground">{s.grant_note}</div>}
                        </td>
                        <td className="px-3 py-2">{s.status}</td>
                        <td className="px-3 py-2">
                          {s.grant_type === 'manual' ? (
                            <Input type="datetime-local" className="h-8 text-xs" defaultValue={toInput(s.current_end)}
                              onBlur={e => { const v = e.target.value; if (v && v !== toInput(s.current_end)) patchGrant(s.id, { end_at: v }); }} />
                          ) : (
                            // Razorpay dates belong to the mandate — the next charged webhook
                            // would overwrite anything edited here.
                            <span title="Owned by the Razorpay mandate">{s.current_end?.replace('T', ' ').slice(0, 16)}</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {s.grant_type === 'manual' && s.status === 'active' && (
                            <Button variant="outline" size="sm" onClick={() => endGrantNow(s.id)}>End Now</Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Ending a grant stops new page tokens immediately; already-issued page tokens stay
              valid for up to 6 hours.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGrantFor(null)}>Close</Button>
            <Button onClick={submitGrant} disabled={saving}>{saving ? 'Saving…' : 'Grant Access'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

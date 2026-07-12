import { useEffect, useState, useCallback } from 'react';
import { portalApi } from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Badge } from '../components/ui/badge';
import { Users, Plus, Trash2, Ban } from 'lucide-react';

interface Props { slug: string; token: string; }

export function UserManagementPage({ slug, token }: Props) {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '' });
  const [saving, setSaving] = useState(false);
  const [tempPassword, setTempPassword] = useState('');

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
    </div>
  );
}

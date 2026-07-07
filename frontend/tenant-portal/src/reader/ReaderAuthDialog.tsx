import { useState } from 'react';
import { readerApi } from '../lib/api';
import { ReaderSession } from './lib';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';

export function ReaderAuthDialog({ slug, onClose, onAuth }: { slug: string; onClose: () => void; onAuth: (s: ReaderSession) => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    const res = mode === 'login'
      ? await readerApi.login(slug, { email, password })
      : await readerApi.signup(slug, { name, email, password });
    setBusy(false);
    if (!res.ok || !res.data) { setError(res.error?.message ?? 'Failed'); return; }
    onAuth({ token: res.data.token, reader: res.data.reader });
  };

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{mode === 'login' ? 'Sign in to read' : 'Create a reader account'}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {mode === 'signup' && (
            <div className="space-y-1.5"><Label>Name</Label><Input value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
          )}
          <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required /></div>
          <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={password} onChange={e => setPassword(e.target.value)} required /></div>
          {error && <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>}
          <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Sign Up'}</Button>
          <p className="text-center text-sm text-muted-foreground">
            {mode === 'login' ? "No account?" : 'Have an account?'}{' '}
            <button type="button" className="text-primary hover:underline" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </form>
      </DialogContent>
    </Dialog>
  );
}

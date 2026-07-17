import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { readerApi } from '../lib/api';
import { ReaderSession } from './lib';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { ArrowLeft, UserCircle, ShieldAlert } from 'lucide-react';

interface Props {
  slug: string;
  basePath?: string;
  session: ReaderSession | null;
  orgName?: string;
  onRequireAuth: () => void;
  onSignedOut: () => void;
}

export function ReaderAccount({ slug, basePath = '', session, orgName, onRequireAuth, onSignedOut }: Props) {
  const [subs, setSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session) { setLoading(false); return; }
    readerApi.me(slug, session.token).then(res => {
      if (res.ok && res.data) setSubs(res.data.subscriptions ?? []);
      setLoading(false);
    });
  }, [slug, session]);

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <UserCircle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
        <h1 className="font-serif text-2xl font-bold">Your Account</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in to manage your subscription.</p>
        <Button className="mt-6" onClick={onRequireAuth}>Sign in</Button>
      </div>
    );
  }

  const cancel = async () => {
    if (!window.confirm('Cancel your subscription? You may lose premium access depending on the publication’s refund policy.')) return;
    setBusy(true); setError(''); setMsg('');
    const res = await readerApi.cancelSubscription(slug, session.token);
    setBusy(false);
    if (res.ok) {
      setMsg(res.data?.access_until === 'now'
        ? 'Subscription cancelled. Premium access has ended.'
        : 'Subscription cancelled. You keep access until the end of your current period.');
      const me = await readerApi.me(slug, session.token);
      if (me.ok && me.data) setSubs(me.data.subscriptions ?? []);
    } else {
      setError(res.error?.message ?? 'Could not cancel. Please contact the publication to cancel for you.');
    }
  };

  const deleteAccount = async () => {
    if (!window.confirm('Permanently delete your account and all subscriptions with this publication? This cannot be undone.')) return;
    setBusy(true); setError('');
    const res = await readerApi.deleteAccount(slug, session.token);
    setBusy(false);
    if (res.ok) { onSignedOut(); }
    else setError(res.error?.message ?? 'Could not delete account. Please contact the publication.');
  };

  const requestRefund = async () => {
    const reason = window.prompt('Tell us why you’re requesting a refund. The publication will review it and process any eligible refund manually.');
    if (reason === null) return; // cancelled
    setBusy(true); setError(''); setMsg('');
    const res = await readerApi.requestRefund(slug, reason.trim(), session.token);
    setBusy(false);
    if (res.ok) {
      setMsg(res.data?.within_policy_window
        ? 'Refund request submitted — it’s within the refund window. The publication will review it shortly.'
        : 'Refund request submitted. It may fall outside the standard refund window; the publication will review it.');
    } else {
      setError(res.error?.message ?? 'Could not submit refund request. Please contact the publication.');
    }
  };

  const active = subs.filter(s => s.status === 'active');

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link to={basePath || '/'} className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to {orgName || 'home'}
      </Link>

      <h1 className="font-serif text-3xl font-bold">Your Account</h1>
      <p className="mt-1 text-sm text-muted-foreground">{session.reader.email}</p>

      {msg && <div className="mt-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-2.5 text-sm text-green-600">{msg}</div>}
      {error && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-sm text-red-500">{error}</div>}

      <Card className="mt-6">
        <CardContent className="p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Subscription</h2>
          {loading ? (
            <div className="py-6 text-sm text-muted-foreground">Loading…</div>
          ) : active.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">You don't have an active subscription.</p>
          ) : (
            <div className="mt-3 space-y-2">
              {active.map((s, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                  <span>Active subscription</span>
                  {s.current_end && <span className="text-muted-foreground">until {new Date(s.current_end).toLocaleDateString()}</span>}
                </div>
              ))}
              <Button variant="outline" className="mt-2" disabled={busy} onClick={cancel}>
                {busy ? 'Working…' : 'Cancel Subscription'}
              </Button>
              <p className="text-xs text-muted-foreground">
                Can't cancel here? Contact {orgName || 'the publication'} and they can cancel it for you.
              </p>
            </div>
          )}
          <div className="mt-4 border-t border-border pt-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Refund</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Charged by mistake or within {orgName || 'the publication'}’s refund window? Request a refund and they’ll review it.
            </p>
            <Button variant="outline" className="mt-3" disabled={busy} onClick={requestRefund}>
              Request a refund
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4 border-red-500/30">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <ShieldAlert className="mt-0.5 h-5 w-5 text-red-500" />
            <div>
              <h2 className="text-sm font-semibold">Delete account</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Permanently remove your account and cancel any subscriptions with this publication.
              </p>
              <Button variant="outline" className="mt-3 border-red-500/40 text-red-500 hover:bg-red-500/10" disabled={busy} onClick={deleteAccount}>
                Delete my account
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

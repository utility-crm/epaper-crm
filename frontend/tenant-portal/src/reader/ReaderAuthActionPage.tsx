import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { readerApi } from '../lib/api';
import { CheckCircle2, MailCheck, XCircle } from 'lucide-react';

interface Props {
  slug: string;
  basePath: string;
  mode: 'verify' | 'reset';
}

// Landing page for the links the content worker mails readers:
//   <base>/auth/verify?code=<64 hex>   and   <base>/auth/reset?code=<64 hex>
// where <base> is the publication's verified custom domain, or /read/:slug — both are
// served by this route, so nothing here may assume one shape.
export const ReaderAuthActionPage: React.FC<Props> = ({ slug, basePath, mode }) => {
  const [params] = useSearchParams();
  const code = params.get('code') || '';
  const home = basePath || '/';

  return mode === 'verify'
    ? <VerifyPanel slug={slug} code={code} home={home} />
    : <ResetPanel slug={slug} code={code} home={home} />;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 text-center shadow-sm">{children}</div>
    </div>
  );
}

function VerifyPanel({ slug, code, home }: { slug: string; code: string; home: string }) {
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState('');
  // The code is single-use, so redeem it exactly once — StrictMode double-invokes
  // effects in dev and the second POST would report the token as already used.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    if (!code) {
      setState('failed');
      setMessage('This link is missing its verification code.');
      return;
    }

    readerApi.confirmVerifyEmail(slug, code).then(res => {
      if (res.ok) {
        setState('done');
      } else {
        setState('failed');
        setMessage(res.error?.message ?? 'We could not verify your email.');
      }
    });
  }, [slug, code]);

  return (
    <Shell>
      {state === 'working' && (
        <>
          <div className="spinner mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Verifying your email…</p>
        </>
      )}
      {state === 'done' && (
        <>
          <CheckCircle2 className="mx-auto mb-4 h-9 w-9 text-emerald-600" />
          <h1 className="font-serif text-xl font-bold">Email verified</h1>
          <p className="mt-2 text-sm text-muted-foreground">Thanks — your address is confirmed.</p>
        </>
      )}
      {state === 'failed' && (
        <>
          <XCircle className="mx-auto mb-4 h-9 w-9 text-red-500" />
          <h1 className="font-serif text-xl font-bold">Link didn't work</h1>
          <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            You can keep reading either way — request a fresh link from your account page.
          </p>
        </>
      )}
      <Link to={home} className="mt-6 inline-block text-sm font-semibold underline">Back to the paper</Link>
    </Shell>
  );
}

function ResetPanel({ slug, code, home }: { slug: string; code: string; home: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    // Same minimum reader signup enforces, checked before posting: the code is
    // single-use, so a rejected password must not cost the reader their link.
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    const res = await readerApi.confirmPasswordReset(slug, code, password);
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error?.message ?? 'Could not reset your password. Request a new link.');
  };

  if (done) {
    return (
      <Shell>
        <MailCheck className="mx-auto mb-4 h-9 w-9 text-emerald-600" />
        <h1 className="font-serif text-xl font-bold">Password changed</h1>
        <p className="mt-2 text-sm text-muted-foreground">Sign in with your new password.</p>
        <Link to={home} className="mt-6 inline-block text-sm font-semibold underline">Back to the paper</Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="font-serif text-xl font-bold">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted-foreground">At least 8 characters.</p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</div>
      )}

      <form onSubmit={submit} className="mt-5 space-y-3 text-left">
        <input
          type="password"
          required
          value={password}
          onChange={e => setPassword(e.target.value)}
          placeholder="New password"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none"
        />
        <input
          type="password"
          required
          value={confirm}
          onChange={e => setConfirm(e.target.value)}
          placeholder="Repeat new password"
          className="w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none"
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors disabled:opacity-50"
        >
          {busy ? 'Please wait…' : 'Set new password'}
        </button>
      </form>

      <Link to={home} className="mt-6 inline-block text-sm font-semibold underline">Back to the paper</Link>
    </Shell>
  );
}

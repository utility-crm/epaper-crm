import React, { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { portalApi } from '../lib/api';
import { CheckCircle2, Loader2, Mail } from 'lucide-react';

// Landing page for the publisher verification link:
//   https://<AUTH_LINK_BASE>/auth/verify?code=<64 hex>
// The code is single-use, so it is redeemed exactly once per mount — StrictMode
// double-invokes effects in dev, and a second POST would burn the token and show a
// spurious "already used" error.
export function AuthVerifyPage() {
  const [params] = useSearchParams();
  const code = params.get('code') || '';
  const [state, setState] = useState<'working' | 'done' | 'failed'>('working');
  const [message, setMessage] = useState('');
  const [resendEmail, setResendEmail] = useState('');
  const [resendMsg, setResendMsg] = useState('');
  const [resending, setResending] = useState(false);
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;

    if (!code) {
      setState('failed');
      setMessage('This link is missing its verification code. Request a new one below.');
      return;
    }

    portalApi.confirmVerifyEmail(code).then(res => {
      if (res.ok) {
        setState('done');
      } else {
        setState('failed');
        setMessage(res.error?.message ?? 'We could not verify your email. Request a new link below.');
      }
    });
  }, [code]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    setResending(true);
    try {
      const res = await portalApi.sendVerifyEmail(resendEmail);
      setResendMsg(res.data?.message ?? 'If that address has an account, an email is on its way.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-8" style={{ fontFamily: "'Inter', sans-serif" }}>
      <div className="w-full max-w-[420px] text-center">
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-sm p-2">
          <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
        </div>

        {state === 'working' && (
          <>
            <Loader2 className="animate-spin h-6 w-6 text-slate-400 mx-auto mb-4" />
            <p className="text-slate-500 text-sm">Verifying your email…</p>
          </>
        )}

        {state === 'done' && (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl font-extrabold text-slate-900 mb-2" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Email verified
            </h1>
            <p className="text-slate-500 text-sm mb-6">Your address is confirmed. You can sign in as usual.</p>
            <Link
              to="/login"
              className="w-full inline-flex items-center justify-center py-3 px-4 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg transition-all shadow-sm active:scale-[0.98] text-xs"
            >
              Go to sign in
            </Link>
          </>
        )}

        {state === 'failed' && (
          <>
            <h1 className="text-2xl font-extrabold text-slate-900 mb-2" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
              Link didn't work
            </h1>
            <p className="text-slate-500 text-sm mb-6">{message}</p>

            {resendMsg ? (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-xs">
                {resendMsg}
              </div>
            ) : (
              <form onSubmit={handleResend} className="space-y-3 text-left">
                <label htmlFor="resend-email" className="block text-xs font-semibold text-slate-700">Work Email</label>
                <input
                  id="resend-email"
                  type="email"
                  required
                  value={resendEmail}
                  onChange={e => setResendEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-red-500/20 focus:border-red-500 outline-none text-sm transition-all shadow-sm"
                />
                <button
                  type="submit"
                  disabled={resending}
                  className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition-all shadow-sm active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2 text-xs"
                >
                  {resending ? <Loader2 className="animate-spin h-4 w-4" /> : <Mail className="h-4 w-4" />}
                  Send a new link
                </button>
              </form>
            )}

            <Link to="/login" className="block mt-6 text-xs font-semibold text-slate-500 hover:text-slate-700">
              Back to sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

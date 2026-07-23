import { useState } from 'react';
import { readerApi } from '../lib/api';
import { ReaderSession } from './lib';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Newspaper, X, Phone, Mail } from 'lucide-react';
import { auth, googleProvider, signInWithPopup } from '../lib/firebase';
import { PhoneAuthForm } from '../components/PhoneAuthForm';

// Theme definitions for branded auth pages
const THEMES: Record<string, {
  bg: string; card: string; accent: string; button: string; text: string; subtext: string; border: string;
}> = {
  modern: {
    bg: 'bg-slate-50',
    card: 'bg-white border border-slate-200 shadow-xl',
    accent: 'from-red-600 to-rose-700',
    button: 'bg-red-600 hover:bg-red-500 text-white font-600',
    text: 'text-slate-900',
    subtext: 'text-slate-500',
    border: 'border-slate-300 bg-white text-slate-900 placeholder-slate-400 focus:border-red-500',
  },
  classic: {
    bg: 'bg-stone-100',
    card: 'bg-white border border-stone-200 shadow-lg',
    accent: 'from-stone-700 to-stone-900',
    button: 'bg-stone-800 hover:bg-stone-700 text-white',
    text: 'text-stone-900',
    subtext: 'text-stone-500',
    border: 'border-stone-300 bg-white text-stone-900 placeholder-stone-400 focus:border-stone-600',
  },
  bold: {
    bg: 'bg-black',
    card: 'bg-zinc-900 border border-yellow-400/30',
    accent: 'from-yellow-400 to-orange-500',
    button: 'bg-yellow-400 hover:bg-yellow-300 text-black font-bold',
    text: 'text-white',
    subtext: 'text-zinc-400',
    border: 'border-zinc-700 bg-zinc-800 text-white placeholder-zinc-500 focus:border-yellow-400',
  },
  minimal: {
    bg: 'bg-white',
    card: 'bg-white border border-gray-200 shadow-sm',
    accent: 'from-blue-500 to-indigo-600',
    button: 'bg-gray-900 hover:bg-gray-700 text-white',
    text: 'text-gray-900',
    subtext: 'text-gray-500',
    border: 'border-gray-300 bg-white text-gray-900 placeholder-gray-400 focus:border-gray-700',
  },
};

interface Props {
  slug: string;
  initialMode?: 'login' | 'signup';
  orgName?: string;
  logoUrl?: string | null;
  orgSettings?: {
    theme_id?: string;
    reader_auth_otp_enabled?: number;
    reader_auth_email_enabled?: number;
    reader_auth_otp_only?: number;
  } | null;
  onClose: () => void;
  onAuth: (s: ReaderSession) => void;
}

export function ReaderAuthDialog({ slug, initialMode = 'login', orgName, logoUrl, orgSettings, onClose, onAuth }: Props) {
  // Publisher-configured reader-auth methods. Defaults: OTP off, email on — matches
  // the backend so an un-migrated tenant still shows the email form.
  const otpEnabled = (orgSettings?.reader_auth_otp_enabled ?? 0) === 1;
  const emailEnabled = (orgSettings?.reader_auth_email_enabled ?? 1) === 1;
  const otpOnly = otpEnabled && (orgSettings?.reader_auth_otp_only ?? 0) === 1;
  // OTP-only hard-disables the email/Google surface regardless of the email flag.
  const showEmail = emailEnabled && !otpOnly;
  const showGoogle = showEmail; // Google is part of the email/OAuth surface.

  const [authMethod, setAuthMethod] = useState<'PASSWORD' | 'PHONE'>(otpOnly ? 'PHONE' : 'PASSWORD');
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [logoError, setLogoError] = useState(false);

  const themeKey = (orgSettings?.theme_id ?? 'modern') as keyof typeof THEMES;
  const theme = THEMES[themeKey] ?? THEMES.modern;

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

  const handleFirebaseToken = async (idToken: string) => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/read/${slug}/verify-firebase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      if (res.ok) {
        const data = await res.json() as { ok: boolean; data?: { token: string; reader: any } };
        if (data.ok && data.data?.token && data.data.reader) {
          onAuth({ token: data.data.token, reader: data.data.reader });
        } else {
          setError('Failed to authenticate reader account.');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error?.message || 'Reader verification failed.');
      }
    } catch (err) {
      console.error('Reader firebase verification error:', err);
      setError('Network error during authentication.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleAuth = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const idToken = await result.user.getIdToken(true);
      await handleFirebaseToken(idToken);
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        console.error('Google reader auth error:', err);
        setError('Google sign-in failed. Please try again.');
      }
      setBusy(false);
    }
  };

  return (
    // Full-screen branded overlay
    <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${theme.bg}`}>
      {/* Close button */}
      <button
        onClick={onClose}
        className={`absolute right-4 top-4 rounded-full p-2 transition-opacity opacity-60 hover:opacity-100 ${theme.text}`}
      >
        <X className="h-5 w-5" />
      </button>

      <div className={`w-full max-w-md rounded-2xl p-8 ${theme.card}`}>
        {/* Org branding */}
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          {logoUrl && !logoError ? (
            <img
              src={logoUrl}
              alt={orgName}
              className="h-14 w-auto max-w-[220px] object-contain"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${theme.accent} shadow-lg`}>
              <Newspaper className="h-7 w-7 text-white" />
            </div>
          )}
          <div>
            <h1 className={`font-serif text-xl font-bold ${theme.text}`}>{orgName || slug}</h1>
            <p className={`text-sm mt-0.5 ${theme.subtext}`}>
              {mode === 'login' ? 'Sign in to access your subscription' : 'Create an account to get started'}
            </p>
          </div>
        </div>

        {/* Social / Phone Auth buttons */}
        <div className="space-y-2.5 mb-5">
          {showGoogle && (
            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={busy}
              className={`w-full flex items-center justify-center gap-3 rounded-lg border px-4 py-2.5 text-xs font-semibold shadow-sm transition-all disabled:opacity-50 ${theme.border}`}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              Continue with Google
            </button>
          )}

          {/* Only offer the method switch when BOTH surfaces are available. */}
          {otpEnabled && showEmail && (
            <button
              type="button"
              onClick={() => {
                setAuthMethod(authMethod === 'PHONE' ? 'PASSWORD' : 'PHONE');
                setError('');
              }}
              disabled={busy}
              className={`w-full flex items-center justify-center gap-2.5 rounded-lg border px-4 py-2.5 text-xs font-semibold shadow-sm transition-all disabled:opacity-50 ${theme.border}`}
            >
              {authMethod === 'PHONE' ? (
                <>
                  <Mail className="h-4 w-4 opacity-70" />
                  Continue with Email & Password
                </>
              ) : (
                <>
                  <Phone className="h-4 w-4 opacity-70" />
                  Continue with Mobile (SMS OTP)
                </>
              )}
            </button>
          )}
        </div>

        {showEmail && (
          <div className="relative flex py-2 items-center mb-5">
            <div className={`flex-grow border-t opacity-20 border-current`}></div>
            <span className={`flex-shrink-0 mx-4 text-[0.68rem] font-medium uppercase tracking-wider ${theme.subtext}`}>Or</span>
            <div className={`flex-grow border-t opacity-20 border-current`}></div>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400 mb-4">{error}</div>
        )}

        {authMethod === 'PHONE' || !showEmail ? (
          otpEnabled ? (
            <div className="rounded-xl border border-current/10 p-4">
              <PhoneAuthForm
                stage="reader"
                slug={slug}
                onVerified={handleFirebaseToken}
                onCancel={showEmail ? () => setAuthMethod('PASSWORD') : undefined}
              />
            </div>
          ) : (
            <div className={`rounded-lg border border-current/10 px-4 py-6 text-center text-sm ${theme.subtext}`}>
              Sign-in is not available for this publication right now.
            </div>
          )
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <div className="space-y-1.5">
                <Label className={theme.text}>Full name</Label>
                <input
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${theme.border}`}
                  value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoFocus
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label className={theme.text}>Email address</Label>
              <input
                type="email"
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${theme.border}`}
                value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com"
                autoFocus={mode === 'login'}
              />
            </div>
            <div className="space-y-1.5">
              <Label className={theme.text}>Password</Label>
              <input
                type="password"
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors ${theme.border}`}
                value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={busy}
              className={`mt-2 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${theme.button}`}
            >
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        )}

        {showEmail && (
          <p className={`mt-6 text-center text-sm ${theme.subtext}`}>
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              type="button"
              className={`font-semibold transition-opacity hover:opacity-80 ${theme.text}`}
              onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}
            >
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}

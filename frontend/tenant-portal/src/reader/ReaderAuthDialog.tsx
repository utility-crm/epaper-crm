import { useState } from 'react';
import { readerApi } from '../lib/api';
import { ReaderSession } from './lib';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Newspaper, X } from 'lucide-react';

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
  orgSettings?: { theme_id?: string } | null;
  onClose: () => void;
  onAuth: (s: ReaderSession) => void;
}

export function ReaderAuthDialog({ slug, initialMode = 'login', orgName, logoUrl, orgSettings, onClose, onAuth }: Props) {
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
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
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

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">{error}</div>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`mt-2 w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${theme.button}`}
          >
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

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
      </div>
    </div>
  );
}

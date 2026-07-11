import React, { useState, useEffect } from 'react';
import { portalApi, readerApi } from '../lib/api';
import { Lock, Mail, Eye, EyeOff, Newspaper, ArrowLeft, ShieldCheck, Sparkles } from 'lucide-react';

interface PaperAdminLoginPageProps {
  onLogin: (token: string, slug: string, status: string) => void;
}

export function PaperAdminLoginPage({ onLogin }: PaperAdminLoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Publication context resolved from custom domain or URL path
  const [slug, setSlug] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [resolvingContext, setResolvingContext] = useState(true);

  useEffect(() => {
    async function resolvePublication() {
      try {
        let detectedSlug: string | null = null;
        const pathname = window.location.pathname;

        // Check explicit /read/:slug/admin pattern
        const readMatch = pathname.match(/^\/read\/([^/]+)\/(admin|wp-admin|portal)/);
        if (readMatch && readMatch[1]) {
          detectedSlug = readMatch[1];
        } else {
          // Check custom domain mapping
          const host = window.location.host;
          const isCustomHost =
            host &&
            !['localhost', '127.0.0.1', 'epaperspace.com', 'www.epaperspace.com'].includes(host.split(':')[0]) &&
            !host.endsWith('.epaperspace.com') &&
            !host.endsWith('.pages.dev');

          if (isCustomHost) {
            const res = await readerApi.resolveDomain(host);
            if (res.ok && res.data?.slug) {
              detectedSlug = res.data.slug;
            }
          }
        }

        if (detectedSlug) {
          setSlug(detectedSlug);
          const settingsRes = await readerApi.getSettings(detectedSlug);
          if (settingsRes.ok && settingsRes.data) {
            setOrgName(settingsRes.data.org_name || detectedSlug);
            if (settingsRes.data.logo_url) {
              setLogoUrl(readerApi.logoUrl(detectedSlug));
            }
            if (settingsRes.data.org_name) {
              document.title = `${settingsRes.data.org_name} — Admin Panel Login`;
            }
          }
        }
      } catch {
        // Fallback to default client admin login styling
      } finally {
        setResolvingContext(false);
      }
    }
    resolvePublication();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await portalApi.orgLogin({ email, password });
      if (res.ok && res.data?.token) {
        onLogin(res.data.token, res.data.slug, res.data.status);
      } else {
        setError(res.error?.message ?? 'Invalid email or password. Please try again.');
      }
    } catch {
      setError('Unable to connect to authentication server. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  };

  const displayName = orgName || 'Client Portal';
  const livePaperUrl = slug ? (window.location.pathname.startsWith('/read') ? `/read/${slug}` : '/') : '/';

  return (
    <div className="min-h-screen flex flex-col justify-between bg-slate-950 text-slate-100 selection:bg-red-500/30 selection:text-red-200 relative overflow-hidden">
      {/* Decorative gradient glow background */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[800px] h-[450px] bg-gradient-to-b from-red-600/15 via-rose-600/10 to-transparent rounded-full blur-3xl opacity-80" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[300px] bg-indigo-600/10 rounded-full blur-3xl" />
      </div>

      {/* Top Banner / Breadcrumb */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 py-6 flex items-center justify-between">
        <a
          href={livePaperUrl}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors group"
        >
          <ArrowLeft className="h-4 w-4 text-slate-500 group-hover:-translate-x-0.5 transition-transform" />
          <span>← Go to <strong className="text-slate-200 font-semibold">{displayName}</strong></span>
        </a>

        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-[11px] font-medium text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5 text-red-500" />
          <span>Secure Admin Access</span>
        </div>
      </div>

      {/* Main Login Card (WordPress / wp-admin inspired layout) */}
      <div className="relative z-10 w-full max-w-[440px] mx-auto px-4 py-8">
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800/80 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
          {/* Brand Header */}
          <div className="px-8 pt-9 pb-6 text-center border-b border-slate-800/60 bg-gradient-to-b from-slate-900 to-slate-900/40">
            <div className="flex justify-center mb-5">
              {logoUrl ? (
                <div className="h-14 max-w-[220px] flex items-center justify-center">
                  <img
                    src={logoUrl}
                    alt={displayName}
                    className="max-h-full max-w-full object-contain filter drop-shadow"
                  />
                </div>
              ) : (
                <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-red-600 to-rose-700 flex items-center justify-center shadow-lg shadow-red-600/30 border border-red-500/30">
                  <Newspaper className="h-7 w-7 text-white" />
                </div>
              )}
            </div>

            <h1 className="font-serif text-2xl font-bold tracking-tight text-white">
              {orgName ? `${orgName}` : 'Client Administration'}
            </h1>
            <p className="text-xs uppercase tracking-widest font-semibold text-red-400 mt-1.5">
              Administration Panel
            </p>
          </div>

          {/* Form Section */}
          <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">
            {error && (
              <div className="rounded-xl bg-red-950/60 border border-red-800/80 px-4 py-3.5 text-xs text-red-200 flex items-start gap-2.5 shadow-inner">
                <span className="text-red-400 font-bold mt-0.5">!</span>
                <span className="flex-1 leading-relaxed">{error}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="admin-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                Email Address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="admin-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@publication.com"
                  className="w-full rounded-xl bg-slate-950/80 border border-slate-800 pl-10 pr-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="admin-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Password
                </label>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl bg-slate-950/80 border border-slate-800 pl-10 pr-11 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={e => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-red-600 focus:ring-red-500/30"
                />
                <span className="text-xs text-slate-400">Remember me on this device</span>
              </label>
            </div>

            <button
              id="admin-login-submit"
              type="submit"
              disabled={loading || resolvingContext}
              className="w-full rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-semibold text-sm py-3.5 px-4 shadow-lg shadow-red-600/25 border border-red-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Authenticating…</span>
                </>
              ) : (
                <span>Sign In to Admin Panel</span>
              )}
            </button>
          </form>

          {/* WordPress-style + ePaper Space Co-Branding Footer */}
          <div className="px-8 py-4 bg-slate-950/60 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-1.5">
              <span className="text-red-500 text-sm font-bold">◈</span>
              <span className="font-medium text-slate-300">ePaper Space</span>
              <span className="text-slate-600">•</span>
              <span>Client Portal</span>
            </div>
            <span className="text-[11px] text-slate-500">v2.4</span>
          </div>
        </div>

        {/* Bottom Helper Links */}
        <div className="mt-6 text-center space-y-2">
          <p className="text-xs text-slate-500">
            Protected by ePaper Space Enterprise Auth & Access Logs
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 w-full py-6 text-center text-xs text-slate-600">
        © {new Date().getFullYear()} {orgName || 'ePaper Space'}. All rights reserved.
      </footer>
    </div>
  );
}

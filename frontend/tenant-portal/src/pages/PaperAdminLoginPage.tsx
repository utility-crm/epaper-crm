import React, { useState, useEffect } from 'react';
import { portalApi, readerApi, API_BASE_URL } from '../lib/api';
import { Lock, Mail, Eye, EyeOff, Newspaper, ArrowLeft, ShieldCheck } from 'lucide-react';

interface PaperAdminLoginPageProps {
  onLogin: (token: string, slug: string, status: string) => void;
  expectedSlug?: string | null;
}

export function PaperAdminLoginPage({ onLogin, expectedSlug }: PaperAdminLoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const initialSettings =
    typeof window !== 'undefined' ? (window as any).__EPAPER_INITIAL_SETTINGS__ : null;

  // Publication context resolved instantly from window.__EPAPER_INITIAL_SETTINGS__ or domain/path
  const [slug, setSlug] = useState<string | null>(expectedSlug ?? null);
  const [orgName, setOrgName] = useState<string | null>(initialSettings?.org_name || null);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialSettings?.logo_url || null);
  const [resolvingContext, setResolvingContext] = useState(!initialSettings?.org_name);

  useEffect(() => {
    async function resolvePublication() {
      try {
        let detectedSlug: string | null = expectedSlug ?? null;
        const pathname = window.location.pathname;

        if (!detectedSlug) {
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
        }

        if (detectedSlug) {
          setSlug(detectedSlug);
          // Only fetch public settings (org_name, logo_url) if not already loaded
          if (!orgName || !logoUrl) {
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
        }
      } catch {
        // Fallback to default client admin login styling
      } finally {
        setResolvingContext(false);
      }
    }
    resolvePublication();
  }, [expectedSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await portalApi.orgLogin({ email, password });
      if (res.ok && res.data?.token && res.data?.slug) {
        // Strict Tenant Isolation: If this login page is bound to a publication slug,
        // reject credentials belonging to any other publication tenant.
        if (slug && res.data.slug !== slug) {
          setError(
            `Access denied: These credentials belong to a different publication (${res.data.slug}). Only administrators for ${orgName || slug} can log in here.`
          );
          setLoading(false);
          return;
        }
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

  const formatSlugName = (s: string) =>
    s
      .replace(/-[a-f0-9]{4}$/i, '')
      .replace(/-/g, ' ')
      .toUpperCase();

  const displayName = orgName || (slug ? formatSlugName(slug) : 'Client Portal');
  const livePaperUrl = slug ? (window.location.pathname.startsWith('/read') ? `/read/${slug}` : '/') : '/';

  const resolveAssetUrl = (url: string | null): string | undefined => {
    if (!url) return undefined;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('/api')) {
      return `${API_BASE_URL}${url}`;
    }
    return url;
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        background: 'radial-gradient(ellipse at 60% 30%, rgba(217, 4, 41, 0.08) 0%, transparent 65%), var(--background)',
        color: 'var(--foreground)'
      }}
    >
      {/* Top Banner */}
      <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto', padding: '20px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a
          href={livePaperUrl}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            fontSize: '0.85rem',
            color: 'var(--color-text-secondary)',
            textDecoration: 'none',
            fontWeight: 500
          }}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to <strong style={{ color: 'var(--foreground)' }}>{displayName}</strong></span>
        </a>

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 12px',
          borderRadius: 999,
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--border)',
          fontSize: '0.75rem',
          fontWeight: 600,
          color: 'var(--color-text-secondary)'
        }}>
          <ShieldCheck className="h-3.5 w-3.5" style={{ color: 'var(--primary)' }} />
          <span>Tenant Admin Portal</span>
        </div>
      </div>

      {/* Main Login Card matching portal theme exactly */}
      <div style={{ width: '100%', maxWidth: 440, margin: '0 auto', padding: '16px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {logoUrl ? (
            <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
              <img
                src={resolveAssetUrl(logoUrl)}
                alt={displayName}
                style={{ maxHeight: '100%', maxWidth: 240, objectFit: 'contain' }}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          ) : (
            <div
              style={{
                width: 52,
                height: 52,
                background: 'linear-gradient(135deg, var(--primary), #b91c1c)',
                borderRadius: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 16px',
                boxShadow: '0 0 24px rgba(217, 4, 41, 0.25)',
                color: '#fff'
              }}
            >
              <Newspaper className="h-6 w-6" />
            </div>
          )}
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--foreground)' }}>
            {displayName}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 6, fontSize: '0.875rem', fontWeight: 500 }}>
            ePaper Space • Administration Panel
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card" style={{ padding: 36, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label className="label" htmlFor="admin-email">Email Address</label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 12, display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
                <Mail className="h-4 w-4" />
              </div>
              <input
                className="input"
                id="admin-email"
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@publication.com"
                style={{ paddingLeft: 38 }}
              />
            </div>
          </div>

          <div>
            <label className="label" htmlFor="admin-password">Password</label>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 12, display: 'flex', alignItems: 'center', color: 'var(--color-text-muted)', pointerEvents: 'none' }}>
                <Lock className="h-4 w-4" />
              </div>
              <input
                className="input"
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••••••"
                style={{ paddingLeft: 38, paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ position: 'absolute', top: 0, bottom: 0, right: 12, display: 'flex', alignItems: 'center', background: 'none', border: 'none', color: 'var(--color-text-muted)', cursor: 'pointer' }}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.28)',
                borderRadius: 8,
                padding: '12px 14px',
                color: 'var(--color-danger)',
                fontSize: '0.85rem',
                lineHeight: 1.4
              }}
            >
              {error}
            </div>
          )}

          <button
            id="admin-login-submit"
            className="btn-primary"
            type="submit"
            disabled={loading || resolvingContext}
            style={{ padding: 14, fontSize: '0.95rem', marginTop: 4 }}
          >
            {loading ? 'Authenticating…' : 'Sign In to Admin Panel'}
          </button>
        </form>
      </div>

      {/* Footer */}
      <footer style={{ padding: '24px 16px', textAlign: 'center', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
        © {new Date().getFullYear()} {displayName}. Powered by ePaper Space Portal.
      </footer>
    </div>
  );
}

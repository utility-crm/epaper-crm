import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { LayoutDashboard, Newspaper, CreditCard, KeyRound, Globe, Building2, LogOut, Settings, ExternalLink } from 'lucide-react';
import { LandingPage } from './pages/LandingPage';
import {
  AboutPage,
  ServicesInfoPage,
  PricingInfoPage,
  ContactInfoPage,
  PrivacyPolicyPage,
  TermsConditionsPage,
  RefundPolicyPage,
  DisclaimerPage,
} from './pages/InfoLegalPages';
import { SignupPage } from './pages/SignupPage';
import { OrgLoginPage } from './pages/OrgLoginPage';
import { PaperAdminLoginPage } from './pages/PaperAdminLoginPage';
import { ProvisioningScreen } from './pages/ProvisioningScreen';
import { SuspendedScreen } from './pages/SuspendedScreen';
import { OrgDashboard } from './pages/OrgDashboard';
import { PapersPage } from './pages/PapersPage';
import { PlansPage } from './pages/PlansPage';
import { DomainPage } from './pages/DomainPage';
import { ReaderSubscriptionSetup } from './pages/ReaderSubscriptionSetup';
import { PlatformBillingPage } from './pages/PlatformBillingPage';
import { SettingsPage } from './pages/SettingsPage';
import { ReaderApp } from './reader/ReaderApp';
import { portalApi } from './lib/api';
import { cn } from './lib/utils';
import './index.css';

function decodeJwt(token: string) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function isClientAdminRequest(pathname: string): boolean {
  if (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/wp-admin' ||
    pathname.startsWith('/wp-admin/') ||
    pathname === '/portal' ||
    pathname.startsWith('/portal/') ||
    pathname === '/client-admin' ||
    pathname.startsWith('/client-admin/')
  ) {
    return true;
  }
  if (/^\/read\/[^/]+\/(admin|wp-admin|portal)(\/|$)/.test(pathname)) {
    return true;
  }
  return false;
}

function getAdminBasePrefix(pathname: string): string {
  if (pathname.startsWith('/wp-admin')) return '/wp-admin';
  if (pathname.startsWith('/client-admin')) return '/client-admin';
  const readAdminMatch = pathname.match(/^(\/read\/[^/]+)\/(admin|wp-admin|portal)/);
  if (readAdminMatch) return `${readAdminMatch[1]}/${readAdminMatch[2]}`;
  if (pathname.startsWith('/admin')) return '/admin';
  return '/portal';
}

interface OrgSettings { org_name: string | null; logo_url: string | null; }

function PortalSidebar({ slug, token, basePrefix, onLogout }: { slug: string; token: string; basePrefix: string; onLogout: () => void }) {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    portalApi.getSettings(slug, token).then(res => {
      if (res.ok && res.data) setSettings(res.data);
    });
  }, [slug, token]);

  const displayName = settings?.org_name || slug;
  const logoSrc = settings?.logo_url ? portalApi.logoUrl(slug) : null;

  const navItems = [
    { to: basePrefix, end: true, label: 'Dashboard', icon: LayoutDashboard },
    { to: `${basePrefix}/papers`, label: 'Editions & Papers', icon: Newspaper },
    { to: `${basePrefix}/plans`, label: 'Subscriptions', icon: CreditCard },
    { to: `${basePrefix}/reader-setup`, label: 'Payment Setup', icon: KeyRound },
    { to: `${basePrefix}/domain`, label: 'Custom Domain', icon: Globe },
    { to: `${basePrefix}/platform-billing`, label: 'Platform Billing', icon: Building2 },
  ];

  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isCustomDomain =
    host &&
    !['localhost', '127.0.0.1', 'epaperspace.com', 'www.epaperspace.com'].includes(host) &&
    !host.endsWith('.epaperspace.com') &&
    !host.endsWith('.pages.dev');

  const livePaperHref = isCustomDomain ? '/' : `/read/${slug}`;

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-white px-3.5 py-6 shadow-sm">
      <div className="mb-7 px-1.5">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white border border-slate-200/90 p-1 shadow-sm overflow-hidden flex-shrink-0">
            {logoSrc && !imgError ? (
              <img
                src={logoSrc}
                alt={displayName}
                className="max-h-full max-w-full object-contain"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-red-600 to-rose-700">
                <Newspaper className="h-5 w-5 text-white" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="font-serif text-sm font-bold text-slate-900 leading-snug line-clamp-2 break-words"
              title={displayName}
            >
              {displayName}
            </div>
            <div className="font-mono text-[0.68rem] text-red-600 truncate mt-0.5" title={slug}>
              {slug}
            </div>
          </div>
        </div>

        <a
          href={livePaperHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 flex items-center justify-between w-full rounded-lg bg-slate-50 hover:bg-red-50 border border-slate-200/80 hover:border-red-200 px-3 py-2 text-xs font-medium text-slate-700 hover:text-red-600 transition-all group"
        >
          <span className="flex items-center gap-2">
            <Globe className="h-3.5 w-3.5 text-slate-400 group-hover:text-red-600 transition-colors" />
            View Live ePaper
          </span>
          <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-red-600 transition-colors" />
        </a>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        <div className="mb-1 px-3 text-[0.7rem] uppercase tracking-wider text-muted-foreground/80 font-600">Workspace</div>
        {navItems.map(({ to, end, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-red-50 text-red-600 font-600' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 border-t border-border pt-4 space-y-1">
        <NavLink
          to={`${basePrefix}/settings`}
          className={({ isActive }) =>
            cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-red-50 text-red-600 font-600' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100')
          }
        >
          <Settings className="h-4 w-4" />
          Settings
        </NavLink>
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:text-red-600 hover:bg-red-50"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

function AdminPortalRoutes({ slug, token }: { slug: string; token: string }) {
  return (
    <Routes>
      <Route index element={<OrgDashboard slug={slug} token={token} />} />
      <Route path="papers" element={<PapersPage slug={slug} token={token} />} />
      <Route path="plans" element={<PlansPage slug={slug} token={token} />} />
      <Route path="domain" element={<DomainPage slug={slug} token={token} />} />
      <Route path="reader-setup" element={<ReaderSubscriptionSetup slug={slug} token={token} />} />
      <Route path="platform-billing" element={<PlatformBillingPage slug={slug} token={token} />} />
      <Route path="settings" element={<SettingsPage slug={slug} token={token} />} />
      {/* legacy sub-paths */}
      <Route path="editions" element={<Navigate to="papers" replace />} />
      <Route path="epapers" element={<Navigate to="papers" replace />} />
      <Route path="*" element={<Navigate to="" replace />} />
    </Routes>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('epaper:orgToken'));
  const [tenantStatus, setTenantStatus] = useState<string>(localStorage.getItem('epaper:tenantStatus') ?? 'pending');

  function handleAuth(t: string, _slug: string, status: string) {
    localStorage.setItem('epaper:orgToken', t);
    localStorage.setItem('epaper:tenantStatus', status);
    setToken(t);
    setTenantStatus(status);
  }

  useEffect(() => {
    const onSuspended = () => {
      localStorage.setItem('epaper:tenantStatus', 'suspended');
      setTenantStatus('suspended');
    };
    const onDeleted = () => {
      localStorage.removeItem('epaper:orgToken');
      localStorage.removeItem('epaper:tenantStatus');
      setToken(null);
      setTenantStatus('pending');
      window.location.href = '/';
    };
    const onUnauthorized = () => {
      localStorage.removeItem('epaper:orgToken');
      localStorage.removeItem('epaper:tenantStatus');
      setToken(null);
    };
    window.addEventListener('epaper:tenant-suspended', onSuspended);
    window.addEventListener('epaper:tenant-deleted', onDeleted);
    window.addEventListener('epaper:unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('epaper:tenant-suspended', onSuspended);
      window.removeEventListener('epaper:tenant-deleted', onDeleted);
      window.removeEventListener('epaper:unauthorized', onUnauthorized);
    };
  }, []);

  useEffect(() => {
    if (!token) return;

    const checkStatus = async () => {
      try {
        const res = await portalApi.provisionStatus(token);
        if (!res.ok) {
          const code = res.error?.code;
          if (code && code !== 'NETWORK_ERROR') {
            window.dispatchEvent(new CustomEvent('epaper:tenant-deleted'));
          }
          return;
        }
        const s = res.data?.status;
        if (s === 'deleted' || s === 'deleting') {
          window.dispatchEvent(new CustomEvent('epaper:tenant-deleted'));
        } else if (s === 'suspended') {
          window.dispatchEvent(new CustomEvent('epaper:tenant-suspended'));
        } else if (s === 'active') {
          localStorage.setItem('epaper:tenantStatus', 'active');
        }
      } catch { /* ignore transient network errors */ }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30_000);

    const onVisibility = () => {
      if (document.visibilityState === 'visible') checkStatus();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [token]);

  function handleLogout() {
    localStorage.removeItem('epaper:orgToken');
    localStorage.removeItem('epaper:tenantStatus');
    setToken(null);
    setTenantStatus('pending');
  }

  function handleProvisioned() {
    localStorage.setItem('epaper:tenantStatus', 'active');
    setTenantStatus('active');
  }

  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isCustomDomain =
    host &&
    !['localhost', '127.0.0.1', 'epaperspace.com', 'www.epaperspace.com'].includes(host) &&
    !host.endsWith('.epaperspace.com') &&
    !host.endsWith('.pages.dev');

  const isAdminReq = isClientAdminRequest(path);

  // Serve public reader experience unless this is explicitly an admin request (/admin, /portal, /wp-admin)
  if (!isAdminReq && (path.startsWith('/read') || isCustomDomain)) {
    return <ReaderApp />;
  }

  // Public staff & marketing routes
  if (!token) {
    return (
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/services" element={<ServicesInfoPage />} />
        <Route path="/pricing" element={<PricingInfoPage />} />
        <Route path="/contact" element={<ContactInfoPage />} />
        <Route path="/privacy-policy" element={<PrivacyPolicyPage />} />
        <Route path="/terms-and-conditions" element={<TermsConditionsPage />} />
        <Route path="/refund-policy" element={<RefundPolicyPage />} />
        <Route path="/disclaimer" element={<DisclaimerPage />} />
        <Route path="/signup" element={<SignupPage onSignup={(t, s) => handleAuth(t, s, 'pending')} />} />
        <Route path="/publisher-signup" element={<Navigate to="/signup" replace />} />
        <Route path="/login" element={<OrgLoginPage onLogin={handleAuth} />} />
        <Route path="/admin/*" element={<PaperAdminLoginPage onLogin={(t, s, st) => handleAuth(t, s, st)} />} />
        <Route path="/wp-admin/*" element={<PaperAdminLoginPage onLogin={(t, s, st) => handleAuth(t, s, st)} />} />
        <Route path="/client-admin/*" element={<PaperAdminLoginPage onLogin={(t, s, st) => handleAuth(t, s, st)} />} />
        <Route path="/portal/login" element={<PaperAdminLoginPage onLogin={(t, s, st) => handleAuth(t, s, st)} />} />
        <Route path="/portal" element={<PaperAdminLoginPage onLogin={(t, s, st) => handleAuth(t, s, st)} />} />
        <Route path="/read/:slug/admin/*" element={<PaperAdminLoginPage onLogin={(t, s, st) => handleAuth(t, s, st)} />} />
        <Route path="/read/:slug/wp-admin/*" element={<PaperAdminLoginPage onLogin={(t, s, st) => handleAuth(t, s, st)} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    );
  }

  const payload = decodeJwt(token);
  if (!payload || payload.aud !== 'tenant-portal') {
    handleLogout();
    return null;
  }

  const slug: string = payload.tenantSlug;

  if (tenantStatus === 'suspended') {
    return <SuspendedScreen onLogout={handleLogout} />;
  }

  if (tenantStatus !== 'active') {
    return <ProvisioningScreen token={token} onActive={handleProvisioned} />;
  }

  const basePrefix = getAdminBasePrefix(path);

  return (
    <div className="flex h-screen bg-background font-sans text-foreground">
      <PortalSidebar slug={slug} token={token} basePrefix={basePrefix} onLogout={handleLogout} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Routes>
            <Route path="/portal/*" element={<AdminPortalRoutes slug={slug} token={token} />} />
            <Route path="/admin/*" element={<AdminPortalRoutes slug={slug} token={token} />} />
            <Route path="/wp-admin/*" element={<AdminPortalRoutes slug={slug} token={token} />} />
            <Route path="/client-admin/*" element={<AdminPortalRoutes slug={slug} token={token} />} />
            <Route path="/read/:pubSlug/admin/*" element={<AdminPortalRoutes slug={slug} token={token} />} />
            <Route path="/read/:pubSlug/wp-admin/*" element={<AdminPortalRoutes slug={slug} token={token} />} />
            <Route path="*" element={<Navigate to={basePrefix} replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

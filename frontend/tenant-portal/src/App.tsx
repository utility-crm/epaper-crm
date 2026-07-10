import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { LayoutDashboard, Newspaper, CreditCard, KeyRound, Globe, Building2, LogOut, Settings } from 'lucide-react';
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

const NAV = [
  { to: '/portal', end: true, label: 'Dashboard', icon: LayoutDashboard },
  { to: '/portal/papers', label: 'Editions & Papers', icon: Newspaper },
  { to: '/portal/plans', label: 'Subscriptions', icon: CreditCard },
  { to: '/portal/reader-setup', label: 'Payment Setup', icon: KeyRound },
  { to: '/portal/domain', label: 'Custom Domain', icon: Globe },
  { to: '/portal/platform-billing', label: 'Platform Billing', icon: Building2 },
];

interface OrgSettings { org_name: string | null; logo_url: string | null; }

function PortalSidebar({ slug, token, onLogout }: { slug: string; token: string; onLogout: () => void }) {
  const [settings, setSettings] = useState<OrgSettings | null>(null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    portalApi.getSettings(slug, token).then(res => {
      if (res.ok && res.data) setSettings(res.data);
    });
  }, [slug, token]);

  const displayName = settings?.org_name || slug;
  const logoSrc = settings?.logo_url ? portalApi.logoUrl(slug) : null;

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-white px-3 py-6 shadow-sm">
      <div className="mb-9 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-red-600 to-rose-700 shadow-md shadow-red-500/20 overflow-hidden flex-shrink-0">
          {logoSrc && !imgError ? (
            <img src={logoSrc} alt={displayName} className="h-full w-full object-cover" onError={() => setImgError(true)} />
          ) : (
            <Newspaper className="h-4 w-4 text-white" />
          )}
        </div>
        <div className="leading-tight min-w-0">
          <div className="font-serif text-sm font-700 text-foreground truncate">{displayName}</div>
          <div className="font-mono text-[0.7rem] text-primary truncate">{slug}</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        <div className="mb-1 px-3 text-[0.7rem] uppercase tracking-wider text-muted-foreground/80 font-600">Workspace</div>
        {NAV.map(({ to, end, label, icon: Icon }) => (
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
          to="/portal/settings"
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

  // ── Heartbeat: actively checks tenant status every 30s so deleted/suspended
  //    orgs auto-logout even on idle tabs, without waiting for an API call.
  useEffect(() => {
    if (!token) return;

    const checkStatus = async () => {
      try {
        const res = await portalApi.provisionStatus(token);
        // If the tenant no longer exists at all (404 / any api error that isn't a network issue),
        // treat it as deleted and force logout
        if (!res.ok) {
          const code = res.error?.code;
          if (code && code !== 'NETWORK_ERROR') {
            // Server responded but doesn't recognize this tenant — force logout
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
          // Keep local storage in sync
          localStorage.setItem('epaper:tenantStatus', 'active');
        }
      } catch { /* ignore transient network errors */ }
    };

    // Check immediately on mount, then every 30 seconds
    checkStatus();
    const interval = setInterval(checkStatus, 30_000);

    // Also re-check instantly when the user switches back to this tab
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

  // Public reader experience — served at the tenant's custom domain (or /read/:slug).
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  const isCustomDomain =
    host &&
    !['localhost', '127.0.0.1', 'epaperspace.com', 'www.epaperspace.com'].includes(host) &&
    !host.endsWith('.epaperspace.com') &&
    !host.endsWith('.pages.dev');

  if (path.startsWith('/read') || isCustomDomain) {
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
        <Route path="/portal/login" element={<OrgLoginPage onLogin={handleAuth} />} />
        <Route path="/client-admin/login" element={<Navigate to="/portal/login" replace />} />
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

  return (
    <div className="flex h-screen bg-background font-sans text-foreground">
      <PortalSidebar slug={slug} token={token} onLogout={handleLogout} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Routes>
            <Route path="/portal" element={<OrgDashboard slug={slug} token={token} />} />
            <Route path="/portal/papers" element={<PapersPage slug={slug} token={token} />} />
            <Route path="/portal/plans" element={<PlansPage slug={slug} token={token} />} />
            <Route path="/portal/domain" element={<DomainPage slug={slug} token={token} />} />
            <Route path="/portal/reader-setup" element={<ReaderSubscriptionSetup slug={slug} token={token} />} />
            <Route path="/portal/platform-billing" element={<PlatformBillingPage slug={slug} token={token} />} />
            <Route path="/portal/settings" element={<SettingsPage slug={slug} token={token} />} />
            {/* legacy paths */}
            <Route path="/portal/editions" element={<Navigate to="/portal/papers" replace />} />
            <Route path="/portal/epapers" element={<Navigate to="/portal/papers" replace />} />
            <Route path="*" element={<Navigate to="/portal" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

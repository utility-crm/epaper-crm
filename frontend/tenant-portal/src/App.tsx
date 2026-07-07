import { useState } from 'react';
import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { LayoutDashboard, Newspaper, CreditCard, KeyRound, Globe, Building2, LogOut } from 'lucide-react';
import { SignupPage } from './pages/SignupPage';
import { OrgLoginPage } from './pages/OrgLoginPage';
import { ProvisioningScreen } from './pages/ProvisioningScreen';
import { OrgDashboard } from './pages/OrgDashboard';
import { PapersPage } from './pages/PapersPage';
import { PlansPage } from './pages/PlansPage';
import { DomainPage } from './pages/DomainPage';
import { ReaderSubscriptionSetup } from './pages/ReaderSubscriptionSetup';
import { PlatformBillingPage } from './pages/PlatformBillingPage';
import { ReaderApp } from './reader/ReaderApp';
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

function PortalSidebar({ slug, onLogout }: { slug: string; onLogout: () => void }) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-card/40 px-3 py-6">
      <div className="mb-9 flex items-center gap-2.5 px-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-violet-600 shadow-lg shadow-primary/30">
          <Newspaper className="h-4 w-4 text-white" />
        </div>
        <div className="leading-tight">
          <div className="font-serif text-sm font-700 text-foreground">Publisher</div>
          <div className="font-mono text-[0.7rem] text-primary">{slug}</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        <div className="mb-1 px-3 text-[0.7rem] uppercase tracking-wider text-muted-foreground/70">Workspace</div>
        {NAV.map(({ to, end, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
              )
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <button
        onClick={onLogout}
        className="mt-4 flex items-center gap-3 rounded-lg border-t border-border px-3 pt-4 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <LogOut className="h-4 w-4" />
        Sign Out
      </button>
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
  // Rendered before any staff-auth gating.
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  if (path.startsWith('/read')) {
    return <ReaderApp />;
  }

  // Public staff routes
  if (!token) {
    return (
      <Routes>
        <Route path="/signup" element={<SignupPage onSignup={(t, s) => handleAuth(t, s, 'pending')} />} />
        <Route path="/portal/login" element={<OrgLoginPage onLogin={handleAuth} />} />
        <Route path="*" element={<Navigate to="/signup" />} />
      </Routes>
    );
  }

  const payload = decodeJwt(token);
  if (!payload || payload.aud !== 'tenant-portal') {
    handleLogout();
    return null;
  }

  const slug: string = payload.tenantSlug;

  if (tenantStatus !== 'active') {
    return <ProvisioningScreen token={token} onActive={handleProvisioned} />;
  }

  return (
    <div className="flex h-screen bg-background font-sans text-foreground">
      <PortalSidebar slug={slug} onLogout={handleLogout} />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-8">
          <Routes>
            <Route path="/portal" element={<OrgDashboard slug={slug} token={token} />} />
            <Route path="/portal/papers" element={<PapersPage slug={slug} token={token} />} />
            <Route path="/portal/plans" element={<PlansPage slug={slug} token={token} />} />
            <Route path="/portal/domain" element={<DomainPage slug={slug} token={token} />} />
            <Route path="/portal/reader-setup" element={<ReaderSubscriptionSetup slug={slug} token={token} />} />
            <Route path="/portal/platform-billing" element={<PlatformBillingPage slug={slug} token={token} />} />
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

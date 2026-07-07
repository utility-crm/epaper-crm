import React, { useState } from 'react';
import { Routes, Route, Navigate, NavLink } from 'react-router-dom';
import { SignupPage } from './pages/SignupPage';
import { OrgLoginPage } from './pages/OrgLoginPage';
import { ProvisioningScreen } from './pages/ProvisioningScreen';
import { OrgDashboard } from './pages/OrgDashboard';
import { EditionsPage } from './pages/EditionsPage';
import { BillingConfigPage } from './pages/BillingConfigPage';
import './index.css';

function decodeJwt(token: string) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function PortalSidebar({ slug, onLogout }: { slug: string; onLogout: () => void }) {
  const link = (isActive: boolean): React.CSSProperties => ({
    display: 'block', padding: '10px 14px', borderRadius: 8, textDecoration: 'none', fontWeight: 500, fontSize: '0.9rem',
    background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
    color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ width: 220, minHeight: '100vh', background: 'var(--color-bg-surface)',
      borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', padding: '24px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
        <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, var(--color-brand-primary), #7c3aed)',
          borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 16px var(--color-brand-glow)' }}>
          <span style={{ fontSize: '1.1rem' }}>◈</span>
        </div>
        <span style={{ fontWeight: 700, fontSize: '0.9rem', fontFamily: 'var(--font-mono)', color: 'var(--color-brand-primary)' }}>{slug}</span>
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', padding: '0 14px', marginBottom: 4, letterSpacing: '0.08em' }}>Portal</div>
        <NavLink to="/portal" end style={({ isActive }) => link(isActive)}>Dashboard</NavLink>
        <NavLink to="/portal/editions" style={({ isActive }) => link(isActive)}>Editions</NavLink>
        <NavLink to="/portal/billing" style={({ isActive }) => link(isActive)}>Billing</NavLink>
      </nav>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
        <button className="btn-secondary" onClick={onLogout} style={{ width: '100%', fontSize: '0.875rem', padding: '8px 12px' }}>Sign Out</button>
      </div>
    </div>
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

  // Public routes
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

  // Provisioning guard
  if (tenantStatus !== 'active') {
    return <ProvisioningScreen token={token} onActive={handleProvisioned} />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--color-bg-base)', fontFamily: 'var(--font-sans)' }}>
      <PortalSidebar slug={slug} onLogout={handleLogout} />
      <main style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <Routes>
            <Route path="/portal" element={<OrgDashboard slug={slug} token={token} />} />
            <Route path="/portal/editions" element={<EditionsPage slug={slug} token={token} />} />
            <Route path="/portal/billing" element={<BillingConfigPage slug={slug} token={token} />} />
            <Route path="*" element={<Navigate to="/portal" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

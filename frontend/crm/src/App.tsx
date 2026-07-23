import React, { useState } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { TenantsPage } from './pages/TenantsPage';
import { TenantDetailPage } from './pages/TenantDetailPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { SettingsPage } from './pages/SettingsPage';
import { AdminsPage } from './pages/AdminsPage';
import { TiersPage } from './pages/TiersPage';
import { RefundsPage } from './pages/RefundsPage';
import { EmailMonitorPage } from './pages/EmailMonitorPage';

function decodeToken(token: string) {
  try {
    return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
  } catch { return null; }
}

function Sidebar({ email, role, onLogout }: { email: string; role: string; onLogout: () => void }) {
  const linkStyle = (isActive: boolean): React.CSSProperties => ({
    display: 'block', padding: '10px 14px', borderRadius: 8,
    textDecoration: 'none', fontWeight: 500, fontSize: '0.9rem',
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
        <span style={{ fontWeight: 700, fontSize: '1rem' }}>ePaper Admin</span>
      </div>

      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', padding: '0 14px', marginBottom: 4, letterSpacing: '0.08em' }}>CRM</div>
        <NavLink to="/" end style={({ isActive }) => linkStyle(isActive)}>Dashboard</NavLink>
        <NavLink to="/tenants" style={({ isActive }) => linkStyle(isActive)}>Tenants</NavLink>
        <NavLink to="/audit" style={({ isActive }) => linkStyle(isActive)}>Audit Log</NavLink>
        
        {role === 'superadmin' && (
          <>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', padding: '0 14px', marginTop: 16, marginBottom: 4, letterSpacing: '0.08em' }}>Platform</div>
            <NavLink to="/tiers" style={({ isActive }) => linkStyle(isActive)}>Subscription Tiers</NavLink>
            <NavLink to="/refunds" style={({ isActive }) => linkStyle(isActive)}>Refund Requests</NavLink>
            <NavLink to="/email-monitor" style={({ isActive }) => linkStyle(isActive)}>Email Monitoring</NavLink>
            <NavLink to="/admins" style={({ isActive }) => linkStyle(isActive)}>Admin Users</NavLink>
          </>
        )}
      </nav>

      <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
        <NavLink to="/settings" style={({ isActive }) => ({...linkStyle(isActive), marginBottom: 8 })}>Settings</NavLink>
        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 10, padding: '0 14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {email} <span style={{ opacity: 0.6 }}>({role})</span>
        </div>
        <button className="btn-secondary" onClick={onLogout} style={{ width: '100%', fontSize: '0.875rem', padding: '8px 12px' }}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('epaper:adminToken'));

  const handleLogin = (t: string) => setToken(t);
  const handleLogout = () => {
    localStorage.removeItem('epaper:adminToken');
    setToken(null);
  };

  if (!token) return <AdminLoginPage onLogin={handleLogin} />;

  const payload = decodeToken(token);
  if (!payload || payload.aud !== 'crm') {
    handleLogout();
    return null;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--color-bg-base)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>
      <Sidebar email={payload.email ?? payload.sub ?? 'admin'} role={payload.role ?? 'admin'} onLogout={handleLogout} />
      <main style={{ flex: 1, overflowY: 'auto', padding: 32 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tenants" element={<TenantsPage />} />
            <Route path="/tenants/:slug" element={<TenantDetailPage />} />
            <Route path="/audit" element={<AuditLogPage />} />
            <Route path="/settings" element={<SettingsPage role={payload.role ?? 'admin'} />} />
            {payload.role === 'superadmin' && (
              <>
                <Route path="/admins" element={<AdminsPage />} />
                <Route path="/tiers" element={<TiersPage />} />
                <Route path="/refunds" element={<RefundsPage />} />
                <Route path="/email-monitor" element={<EmailMonitorPage />} />
              </>
            )}
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

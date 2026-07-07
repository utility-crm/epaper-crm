import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuth } from './context/AuthContext';
import { api } from './lib/api';

// Error Boundary for remotes
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean}> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="card" style={{ borderColor: 'var(--color-danger)' }}>
          <h2 style={{ color: 'var(--color-danger)', marginBottom: '16px' }}>Failed to load module</h2>
          <p style={{ color: 'var(--color-text-secondary)' }}>Make sure the remote dev servers are running (npm run dev:crm, npm run dev:portal).</p>
        </div>
      );
    }
    return this.props.children;
  }
}

// Lazy load remotes (using @originjs/vite-plugin-federation virtual modules)
const CrmApp = lazy(() => import('crm/App').catch(() => {
  return { default: () => <div>Failed to load CRM Module</div> };
}));

const PortalApp = lazy(() => import('tenantPortal/App').catch(() => {
  return { default: () => <div>Failed to load Portal Module</div> };
}));

function LoginGate() {
  const { isAdmin, isOrgUser } = useAuth();
  
  if (isAdmin) return <Navigate to="/crm" />;
  if (isOrgUser) return <Navigate to="/portal" />;
  
  // Need to add actual login UI later
  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="card" style={{ width: '400px' }}>
        <h2 style={{ marginBottom: '24px' }}>Welcome to ePaper</h2>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-primary" style={{ flex: 1 }}>Sign in as Tenant</button>
          <button className="btn-secondary" style={{ flex: 1 }}>Sign in as Admin</button>
        </div>
      </div>
    </div>
  );
}

function Loader() {
  return (
    <div style={{ display: 'flex', height: '200px', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner"></div>
    </div>
  );
}

export default function App() {
  const { isAdmin, isOrgUser } = useAuth();
  
  return (
    <Routes>
      <Route path="/" element={<LoginGate />} />
      
      {isAdmin && (
        <Route path="/crm/*" element={
          <AppShell>
            <ErrorBoundary>
              <Suspense fallback={<Loader />}>
                <CrmApp />
              </Suspense>
            </ErrorBoundary>
          </AppShell>
        } />
      )}
      
      {isOrgUser && (
        <Route path="/portal/*" element={
          <AppShell>
            <ErrorBoundary>
              <Suspense fallback={<Loader />}>
                <PortalApp />
              </Suspense>
            </ErrorBoundary>
          </AppShell>
        } />
      )}
      
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

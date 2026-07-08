import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuth } from './context/AuthContext';
import LandingPage from './pages/LandingPage';
import SignupPage from './pages/SignupPage';
import OrgLoginPage from './pages/OrgLoginPage';
import AdminLoginPage from './pages/AdminLoginPage';

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
      {/* Public marketing & auth pages */}
      <Route
        path="/"
        element={
          isAdmin ? <Navigate to="/crm" /> :
          isOrgUser ? <Navigate to="/portal" /> :
          <LandingPage />
        }
      />
      <Route
        path="/signup"
        element={isOrgUser ? <Navigate to="/portal" /> : <SignupPage />}
      />
      <Route
        path="/login"
        element={isOrgUser ? <Navigate to="/portal" /> : <OrgLoginPage />}
      />
      <Route
        path="/admin-login"
        element={isAdmin ? <Navigate to="/crm" /> : <AdminLoginPage />}
      />

      {/* Protected: CRM (admin only) */}
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

      {/* Protected: Tenant portal (org users only) */}
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

      {/* Catch-all: redirect unauthenticated to landing, authenticated to dashboard */}
      <Route
        path="*"
        element={
          isAdmin ? <Navigate to="/crm" /> :
          isOrgUser ? <Navigate to="/portal" /> :
          <Navigate to="/" />
        }
      />
    </Routes>
  );
}

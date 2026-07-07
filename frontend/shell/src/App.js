import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import React, { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { useAuth } from './context/AuthContext';
// Error Boundary for remotes
class ErrorBoundary extends React.Component {
    constructor(props) { super(props); this.state = { hasError: false }; }
    static getDerivedStateFromError() { return { hasError: true }; }
    render() {
        if (this.state.hasError) {
            return (_jsxs("div", { className: "card", style: { borderColor: 'var(--color-danger)' }, children: [_jsx("h2", { style: { color: 'var(--color-danger)', marginBottom: '16px' }, children: "Failed to load module" }), _jsx("p", { style: { color: 'var(--color-text-secondary)' }, children: "Make sure the remote dev servers are running (npm run dev:crm, npm run dev:portal)." })] }));
        }
        return this.props.children;
    }
}
// Lazy load remotes (using @originjs/vite-plugin-federation virtual modules)
const CrmApp = lazy(() => import('crm/App').catch(() => {
    return { default: () => _jsx("div", { children: "Failed to load CRM Module" }) };
}));
const PortalApp = lazy(() => import('tenantPortal/App').catch(() => {
    return { default: () => _jsx("div", { children: "Failed to load Portal Module" }) };
}));
function LoginGate() {
    const { isAdmin, isOrgUser } = useAuth();
    if (isAdmin)
        return _jsx(Navigate, { to: "/crm" });
    if (isOrgUser)
        return _jsx(Navigate, { to: "/portal" });
    // Need to add actual login UI later
    return (_jsx("div", { style: { display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }, children: _jsxs("div", { className: "card", style: { width: '400px' }, children: [_jsx("h2", { style: { marginBottom: '24px' }, children: "Welcome to ePaper" }), _jsxs("div", { style: { display: 'flex', gap: '12px' }, children: [_jsx("button", { className: "btn-primary", style: { flex: 1 }, children: "Sign in as Tenant" }), _jsx("button", { className: "btn-secondary", style: { flex: 1 }, children: "Sign in as Admin" })] })] }) }));
}
function Loader() {
    return (_jsx("div", { style: { display: 'flex', height: '200px', alignItems: 'center', justifyContent: 'center' }, children: _jsx("div", { className: "spinner" }) }));
}
export default function App() {
    const { isAdmin, isOrgUser } = useAuth();
    return (_jsxs(Routes, { children: [_jsx(Route, { path: "/", element: _jsx(LoginGate, {}) }), isAdmin && (_jsx(Route, { path: "/crm/*", element: _jsx(AppShell, { children: _jsx(ErrorBoundary, { children: _jsx(Suspense, { fallback: _jsx(Loader, {}), children: _jsx(CrmApp, {}) }) }) }) })), isOrgUser && (_jsx(Route, { path: "/portal/*", element: _jsx(AppShell, { children: _jsx(ErrorBoundary, { children: _jsx(Suspense, { fallback: _jsx(Loader, {}), children: _jsx(PortalApp, {}) }) }) }) })), _jsx(Route, { path: "*", element: _jsx(Navigate, { to: "/" }) })] }));
}

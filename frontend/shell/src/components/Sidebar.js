import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
export function Sidebar() {
    const { isAdmin, isOrgUser, logout } = useAuth();
    if (!isAdmin && !isOrgUser)
        return null;
    return (_jsxs("div", { style: {
            width: '240px',
            borderRight: '1px solid var(--color-border)',
            display: 'flex',
            flexDirection: 'column',
            padding: '20px',
            background: 'var(--color-bg-surface)'
        }, children: [_jsx("div", { style: { marginBottom: '40px', fontWeight: 600, fontSize: '1.2rem', color: 'var(--color-text-primary)' }, children: "ePaper Platform" }), _jsxs("nav", { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }, children: [isAdmin && (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px', marginTop: '16px' }, children: "SuperAdmin CRM" }), _jsx(NavLink, { to: "/crm", style: ({ isActive }) => ({
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                    color: isActive ? 'white' : 'var(--color-text-secondary)',
                                    background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                                    transition: 'background 0.2s',
                                    fontWeight: 500
                                }), children: "Dashboard" }), _jsx(NavLink, { to: "/crm/tenants", style: ({ isActive }) => ({
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                    color: isActive ? 'white' : 'var(--color-text-secondary)',
                                    background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                                    transition: 'background 0.2s',
                                    fontWeight: 500
                                }), children: "Tenants" }), _jsx(NavLink, { to: "/crm/audit", style: ({ isActive }) => ({
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                    color: isActive ? 'white' : 'var(--color-text-secondary)',
                                    background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                                    transition: 'background 0.2s',
                                    fontWeight: 500
                                }), children: "Audit Log" })] })), isOrgUser && (_jsxs(_Fragment, { children: [_jsx("div", { style: { fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px', marginTop: '16px' }, children: "Tenant Portal" }), _jsx(NavLink, { to: "/portal", end: true, style: ({ isActive }) => ({
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                    color: isActive ? 'white' : 'var(--color-text-secondary)',
                                    background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                                    transition: 'background 0.2s',
                                    fontWeight: 500
                                }), children: "Dashboard" }), _jsx(NavLink, { to: "/portal/editions", style: ({ isActive }) => ({
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                    color: isActive ? 'white' : 'var(--color-text-secondary)',
                                    background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                                    transition: 'background 0.2s',
                                    fontWeight: 500
                                }), children: "Editions" }), _jsx(NavLink, { to: "/portal/billing", style: ({ isActive }) => ({
                                    padding: '10px 12px',
                                    borderRadius: '6px',
                                    textDecoration: 'none',
                                    color: isActive ? 'white' : 'var(--color-text-secondary)',
                                    background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                                    transition: 'background 0.2s',
                                    fontWeight: 500
                                }), children: "Billing" })] }))] }), _jsx("button", { className: "btn-secondary", onClick: logout, style: { marginTop: 'auto', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }, children: "Sign Out" })] }));
}

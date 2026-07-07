import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState } from 'react';
const AuthContext = createContext(undefined);
function decodeJwtPayload(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3)
            return null;
        const payloadStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
        return JSON.parse(payloadStr);
    }
    catch (e) {
        return null;
    }
}
export function AuthProvider({ children }) {
    const [adminToken, setAdminTokenState] = useState(localStorage.getItem('epaper:adminToken'));
    const [orgToken, setOrgTokenState] = useState(localStorage.getItem('epaper:orgToken'));
    const [tenantStatus, setTenantStatusState] = useState(localStorage.getItem('epaper:tenantStatus'));
    const setAdminToken = (token) => {
        if (token) {
            localStorage.setItem('epaper:adminToken', token);
        }
        else {
            localStorage.removeItem('epaper:adminToken');
        }
        setAdminTokenState(token);
    };
    const setOrgToken = (token) => {
        if (token) {
            localStorage.setItem('epaper:orgToken', token);
        }
        else {
            localStorage.removeItem('epaper:orgToken');
        }
        setOrgTokenState(token);
    };
    const setTenantStatus = (status) => {
        if (status) {
            localStorage.setItem('epaper:tenantStatus', status);
        }
        else {
            localStorage.removeItem('epaper:tenantStatus');
        }
        setTenantStatusState(status);
    };
    const logout = () => {
        setAdminToken(null);
        setOrgToken(null);
        setTenantStatus(null);
    };
    let tenantSlug = null;
    if (orgToken) {
        const payload = decodeJwtPayload(orgToken);
        if (payload && payload.tenantSlug) {
            tenantSlug = payload.tenantSlug;
        }
    }
    return (_jsx(AuthContext.Provider, { value: {
            adminToken,
            orgToken,
            isAdmin: !!adminToken,
            isOrgUser: !!orgToken,
            tenantSlug,
            tenantStatus,
            setAdminToken,
            setOrgToken,
            setTenantStatus,
            logout,
        }, children: children }));
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

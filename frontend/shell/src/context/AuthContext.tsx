import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface AuthContextType {
  adminToken: string | null;
  orgToken: string | null;
  isAdmin: boolean;
  isOrgUser: boolean;
  tenantSlug: string | null;
  tenantStatus: string | null;
  setAdminToken: (token: string | null) => void;
  setOrgToken: (token: string | null) => void;
  setTenantStatus: (status: string | null) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function decodeJwtPayload(token: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payloadStr = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(payloadStr);
  } catch (e) {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [adminToken, setAdminTokenState] = useState<string | null>(localStorage.getItem('epaper:adminToken'));
  const [orgToken, setOrgTokenState] = useState<string | null>(localStorage.getItem('epaper:orgToken'));
  const [tenantStatus, setTenantStatusState] = useState<string | null>(localStorage.getItem('epaper:tenantStatus'));

  const setAdminToken = (token: string | null) => {
    if (token) {
      localStorage.setItem('epaper:adminToken', token);
    } else {
      localStorage.removeItem('epaper:adminToken');
    }
    setAdminTokenState(token);
  };

  const setOrgToken = (token: string | null) => {
    if (token) {
      localStorage.setItem('epaper:orgToken', token);
    } else {
      localStorage.removeItem('epaper:orgToken');
    }
    setOrgTokenState(token);
  };

  const setTenantStatus = (status: string | null) => {
    if (status) {
      localStorage.setItem('epaper:tenantStatus', status);
    } else {
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

  return (
    <AuthContext.Provider
      value={{
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
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

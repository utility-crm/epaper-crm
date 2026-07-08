import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export function Sidebar() {
  const { isAdmin, isOrgUser, logout } = useAuth();
  
  if (!isAdmin && !isOrgUser) return null;
  
  return (
    <div style={{
      width: '240px',
      borderRight: '1px solid var(--color-border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '20px',
      background: 'var(--color-bg-surface)'
    }}>
      <div style={{ marginBottom: '40px', fontWeight: 600, fontSize: '1.2rem', color: 'var(--color-text-primary)' }}>
        ePaper Platform
      </div>
      
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {isAdmin && (
          <>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px', marginTop: '16px' }}>SuperAdmin CRM</div>
            <NavLink to="/crm" style={({isActive}) => ({
              padding: '10px 12px',
              borderRadius: '6px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
              background: isActive ? '#fdf2f4' : 'transparent',
              transition: 'background 0.2s',
              fontWeight: 500
            })}>Dashboard</NavLink>
            <NavLink to="/crm/tenants" style={({isActive}) => ({
              padding: '10px 12px',
              borderRadius: '6px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
              background: isActive ? '#fdf2f4' : 'transparent',
              transition: 'background 0.2s',
              fontWeight: 500
            })}>Tenants</NavLink>
            <NavLink to="/crm/audit" style={({isActive}) => ({
              padding: '10px 12px',
              borderRadius: '6px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
              background: isActive ? '#fdf2f4' : 'transparent',
              transition: 'background 0.2s',
              fontWeight: 500
            })}>Audit Log</NavLink>
          </>
        )}
        
        {isOrgUser && (
          <>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '8px', marginTop: '16px' }}>Tenant Portal</div>
            <NavLink to="/portal" end style={({isActive}) => ({
              padding: '10px 12px',
              borderRadius: '6px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
              background: isActive ? '#fdf2f4' : 'transparent',
              transition: 'background 0.2s',
              fontWeight: 500
            })}>Dashboard</NavLink>
            <NavLink to="/portal/editions" style={({isActive}) => ({
              padding: '10px 12px',
              borderRadius: '6px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
              background: isActive ? '#fdf2f4' : 'transparent',
              transition: 'background 0.2s',
              fontWeight: 500
            })}>Editions</NavLink>
            <NavLink to="/portal/billing" style={({isActive}) => ({
              padding: '10px 12px',
              borderRadius: '6px',
              textDecoration: 'none',
              color: isActive ? 'var(--color-brand-primary)' : 'var(--color-text-secondary)',
              background: isActive ? '#fdf2f4' : 'transparent',
              transition: 'background 0.2s',
              fontWeight: 500
            })}>Billing</NavLink>
          </>
        )}
      </nav>
      
      <button 
        className="btn-secondary"
        onClick={logout} 
        style={{ marginTop: 'auto', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}
      >
        Sign Out
      </button>
    </div>
  );
}

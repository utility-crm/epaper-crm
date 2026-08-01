import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { crmApi } from '../lib/api';

interface AdminLoginPageProps {
  onLogin: (token: string) => void;
}

export function AdminLoginPage({ onLogin }: AdminLoginPageProps) {
  const [email, setEmail] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState<boolean | null>(null);
  const navigate = useNavigate();

  React.useEffect(() => {
    crmApi.setupStatus().then(res => {
      if (res.ok) setIsSetup(res.data?.setupDone ?? false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const password = passwordRef.current?.value || '';
    try {
      const res = isSetup
        ? await crmApi.adminLogin({ email, password })
        : await crmApi.setup({ email, password });
      
      if (res.ok && res.data?.token) {
        localStorage.setItem('epaper:adminToken', res.data.token);
        onLogin(res.data.token);
        navigate('/crm');
      } else {
        setError(res.error?.message ?? 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  if (isSetup === null) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner" /></div>;

  return (
    <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 60% 30%, rgba(99,102,241,0.12) 0%, transparent 70%)' }}>
      <div className="card" style={{ width: 420, padding: 40 }}>
        {/* Logo / Wordmark */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, var(--color-brand-primary), #7c3aed)',
            borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            boxShadow: '0 0 24px var(--color-brand-glow)' }}>
            <span style={{ fontSize: '1.5rem' }}>◈</span>
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700 }}>
            {isSetup ? 'SuperAdmin Sign In' : 'Initial Setup'}
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 8, fontSize: '0.875rem' }}>
            {isSetup ? 'ePaper Platform CRM' : 'Create your superadmin account'}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Email</label>
            <input id="admin-email" className="input" type="email" value={email} required
              onChange={e => setEmail(e.target.value)} placeholder="admin@platform.com" />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label className="label">Password</label>
            <input
              id="admin-password"
              name="password"
              className="input"
              type="password"
              ref={passwordRef}
              autoComplete={isSetup ? 'current-password' : 'new-password'}
              required
              placeholder="Min 8 chars, 1 uppercase, 1 digit"
            />
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: 'var(--color-danger)', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          <button id="admin-submit" className="btn-primary" type="submit" disabled={loading} style={{ width: '100%', padding: 14 }}>
            {loading ? 'Signing in…' : isSetup ? 'Sign In' : 'Create Account & Sign In'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
          Tenant? <a href="/signup" style={{ color: 'var(--color-brand-primary)', textDecoration: 'none' }}>Sign up instead →</a>
        </p>
      </div>
    </div>
  );
}

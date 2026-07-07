import React, { useState } from 'react';
import { portalApi } from '../lib/api';

export function OrgLoginPage({ onLogin }: { onLogin: (token: string, slug: string, status: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await portalApi.orgLogin({ email, password });
      if (res.ok && res.data?.token) {
        onLogin(res.data.token, res.data.slug, res.data.status);
      } else {
        setError(res.error?.message ?? 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at 60% 30%, rgba(99,102,241,0.1) 0%, transparent 60%)' }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg, var(--color-brand-primary), #7c3aed)',
            borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            boxShadow: '0 0 28px var(--color-brand-glow)' }}>
            <span style={{ fontSize: '1.6rem' }}>◈</span>
          </div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Organisation Sign In</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 8, fontSize: '0.9rem' }}>ePaper Tenant Portal</p>
        </div>

        <form onSubmit={handleSubmit} className="card" style={{ padding: 36, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <label className="label">Email</label>
            <input className="input" id="org-email" type="email" required value={email}
              onChange={e => setEmail(e.target.value)} placeholder="you@organisation.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" id="org-password" type="password" required value={password}
              onChange={e => setPassword(e.target.value)} placeholder="Your password" />
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, padding: '10px 14px', color: 'var(--color-danger)', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          <button id="org-login-submit" className="btn-primary" type="submit" disabled={loading} style={{ padding: 14, fontSize: '0.95rem' }}>
            {loading ? 'Signing in…' : 'Sign In'}
          </button>

          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
            New organisation? <a href="/signup" style={{ color: 'var(--color-brand-primary)', textDecoration: 'none' }}>Sign up →</a>
          </p>
        </form>
      </div>
    </div>
  );
}

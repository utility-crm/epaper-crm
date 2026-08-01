import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './AuthPage.css';

export default function OrgLoginPage() {
  const navigate = useNavigate();
  const { setOrgToken, setTenantStatus } = useAuth();

  const [email, setEmail] = useState('');
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const password = passwordRef.current?.value || '';
    try {
      const res = await api.orgLogin({ email, password });
      if (!res.ok) {
        setError(res.error?.message ?? 'Invalid credentials. Please try again.');
        return;
      }
      const { token, status } = res.data!;
      setOrgToken(token);
      if (status) setTenantStatus(status);
      navigate('/portal');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page auth-page--centered">
      <div className="auth-page__form-panel auth-page__form-panel--solo">
        <div className="auth-page__form-wrap">
          <Link to="/" className="auth-page__brand-logo auth-page__brand-logo--dark">
            ePaper<span>Space</span>
          </Link>

          <h1 className="auth-page__form-title" style={{ marginTop: '1.5rem' }}>
            Publisher login
          </h1>
          <p className="auth-page__form-sub">
            Don't have an account?{' '}
            <Link to="/signup" className="auth-page__form-link">Get started free</Link>
          </p>

          {error && <div className="auth-page__error">{error}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label className="auth-field__label">Email address</label>
              <input
                className="auth-field__input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                required
                autoFocus
              />
            </div>

            <div className="auth-field">
              <label className="auth-field__label">Password</label>
              <input
                id="org-password"
                name="password"
                ref={passwordRef}
                className="auth-field__input"
                type="password"
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              className="auth-btn auth-btn--primary"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <p className="auth-page__admin-link">
            Super Admin?{' '}
            <Link to="/admin-login" className="auth-page__form-link">Sign in here</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

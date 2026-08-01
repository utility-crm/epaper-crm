import React, { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './AuthPage.css';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const { setAdminToken } = useAuth();

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
      const res = await api.adminLogin({ email, password });
      if (!res.ok) {
        setError(res.error?.message ?? 'Invalid credentials.');
        return;
      }
      setAdminToken(res.data!.token);
      navigate('/crm');
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

          <div className="auth-page__badge">Super Admin</div>

          <h1 className="auth-page__form-title" style={{ marginTop: '1rem' }}>
            Admin login
          </h1>
          <p className="auth-page__form-sub">
            Publisher?{' '}
            <Link to="/login" className="auth-page__form-link">Sign in here</Link>
          </p>

          {error && <div className="auth-page__error">{error}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label className="auth-field__label">Email</label>
              <input
                className="auth-field__input"
                type="email"
                placeholder="admin@epaperspace.com"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(''); }}
                required
                autoFocus
              />
            </div>

            <div className="auth-field">
              <label className="auth-field__label">Password</label>
              <input
                id="admin-password"
                name="password"
                ref={passwordRef}
                className="auth-field__input"
                type="password"
                placeholder="Admin password"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              className="auth-btn auth-btn--dark"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign in as Admin'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

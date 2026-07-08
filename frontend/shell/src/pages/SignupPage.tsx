import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import './AuthPage.css';

export default function SignupPage() {
  const navigate = useNavigate();
  const { setOrgToken } = useAuth();

  const [form, setForm] = useState({
    orgName: '',
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordRules = [
    { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
    { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
    { label: 'One number', test: (p: string) => /[0-9]/.test(p) },
  ];

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    const failedRule = passwordRules.find(r => !r.test(form.password));
    if (failedRule) {
      setError(`Password requirement: ${failedRule.label}.`);
      return;
    }

    setLoading(true);
    try {
      const res = await api.signup({
        orgName: form.orgName,
        name: form.name,
        email: form.email,
        password: form.password,
      });

      if (!res.ok) {
        setError(res.error?.message ?? 'Signup failed. Please try again.');
        return;
      }

      setOrgToken(res.data!.token);
      navigate('/portal');
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page">
      {/* Left brand panel */}
      <div className="auth-page__brand">
        <Link to="/" className="auth-page__brand-logo">
          ePaper<span>Space</span>
        </Link>
        <h2 className="auth-page__brand-tagline">
          Start publishing your digital newspaper today.
        </h2>
        <p className="auth-page__brand-sub">
          Set up your account in under 2 minutes. Your digital edition will be live
          within moments of publishing.
        </p>
        <ul className="auth-page__brand-bullets">
          <li>✓ PDF to digital in seconds</li>
          <li>✓ Built-in subscriber management</li>
          <li>✓ Real-time analytics dashboard</li>
          <li>✓ Custom domain support</li>
        </ul>
      </div>

      {/* Right form panel */}
      <div className="auth-page__form-panel">
        <div className="auth-page__form-wrap">
          <h1 className="auth-page__form-title">Create your account</h1>
          <p className="auth-page__form-sub">
            Already have an account?{' '}
            <Link to="/login" className="auth-page__form-link">Sign in</Link>
          </p>

          {error && <div className="auth-page__error">{error}</div>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="auth-field">
              <label className="auth-field__label">Publication / Organisation name</label>
              <input
                className="auth-field__input"
                type="text"
                name="orgName"
                placeholder="e.g. The Daily Chronicle"
                value={form.orgName}
                onChange={handleChange}
                required
                autoFocus
              />
            </div>

            <div className="auth-field">
              <label className="auth-field__label">Your full name</label>
              <input
                className="auth-field__input"
                type="text"
                name="name"
                placeholder="John Doe"
                value={form.name}
                onChange={handleChange}
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-field__label">Email address</label>
              <input
                className="auth-field__input"
                type="email"
                name="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={handleChange}
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-field__label">Password</label>
              <input
                className="auth-field__input"
                type="password"
                name="password"
                placeholder="Min. 8 characters"
                value={form.password}
                onChange={handleChange}
                required
              />
              {form.password && (
                <ul className="auth-field__rules">
                  {passwordRules.map(r => (
                    <li key={r.label} className={r.test(form.password) ? 'pass' : 'fail'}>
                      {r.test(form.password) ? '✓' : '○'} {r.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="auth-field">
              <label className="auth-field__label">Confirm password</label>
              <input
                className="auth-field__input"
                type="password"
                name="confirmPassword"
                placeholder="Repeat your password"
                value={form.confirmPassword}
                onChange={handleChange}
                required
              />
            </div>

            <button
              type="submit"
              className="auth-btn auth-btn--primary"
              disabled={loading}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="auth-page__legal">
            By creating an account you agree to our{' '}
            <a href="/terms">Terms of Service</a> and{' '}
            <a href="/privacy">Privacy Policy</a>.
          </p>
        </div>
      </div>
    </div>
  );
}

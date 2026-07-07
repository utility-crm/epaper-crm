import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { portalApi } from '../lib/api';

function slugify(text: string) {
  return text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]+/g, '').replace(/--+/g, '-').replace(/^-+|-+$/g, '');
}

const PLANS = [
  { id: 'starter', label: 'Starter', desc: 'Up to 3 editions/month', price: '₹999/mo' },
  { id: 'growth', label: 'Growth', desc: 'Up to 20 editions/month', price: '₹2,999/mo' },
  { id: 'enterprise', label: 'Enterprise', desc: 'Unlimited editions', price: 'Custom' },
];

export function SignupPage({ onSignup }: { onSignup: (token: string, slug: string) => void }) {
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const previewSlug = orgName ? `${slugify(orgName).slice(0, 30)}-xxxx` : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must be 8+ chars with at least one uppercase and one digit');
      return;
    }
    setLoading(true);
    try {
      const res = await portalApi.signup({ orgName, name, email, password, plan: 'Free' });
      if (res.ok && res.data?.token) {
        onSignup(res.data.token, res.data.slug);
      } else {
        setError(res.error?.message ?? 'Signup failed');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
      background: 'radial-gradient(ellipse at 40% 20%, rgba(99,102,241,0.1) 0%, transparent 60%)' }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 52, height: 52, background: 'linear-gradient(135deg, var(--color-brand-primary), #7c3aed)',
            borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
            boxShadow: '0 0 28px var(--color-brand-glow)' }}>
            <span style={{ fontSize: '1.6rem' }}>◈</span>
          </div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700 }}>Start Publishing Today</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginTop: 8 }}>Create your organisation — everything provisions automatically</p>
        </div>

        <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20, padding: 36 }}>
          <div>
            <label className="label">Organisation Name</label>
            <input className="input" id="org-name" required value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="The Hindu Digital" />
            {previewSlug && (
              <div style={{ marginTop: 6, fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                Your subdomain: <span style={{ color: 'var(--color-brand-primary)' }}>{previewSlug}</span>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label className="label">Your Name</label>
              <input className="input" id="owner-name" required value={name} onChange={e => setName(e.target.value)} placeholder="Priya Sharma" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" id="owner-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@org.com" />
            </div>
          </div>

          <div>
            <label className="label">Password</label>
            <input className="input" id="owner-password" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="8+ chars, 1 uppercase, 1 number" />
          </div>



          {error && (
            <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: 8, padding: '10px 14px', color: 'var(--color-danger)', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          <button id="signup-submit" className="btn-primary" type="submit" disabled={loading} style={{ padding: 14, fontSize: '1rem' }}>
            {loading ? 'Creating your organisation…' : 'Create Organisation →'}
          </button>

          <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>
            Already have an account? <a href="/portal/login" style={{ color: 'var(--color-brand-primary)', textDecoration: 'none' }}>Sign in →</a>
          </p>
        </form>
      </div>
    </div>
  );
}

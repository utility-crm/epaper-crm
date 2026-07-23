import React, { useState, useEffect } from 'react';
import { crmApi } from '../lib/api';

export function SettingsPage({ role }: { role: string }) {
  const isSuperadmin = role === 'superadmin';
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

  // Metered SMS rate (superadmin).
  const [smsRate, setSmsRate] = useState('');
  const [fxFallback, setFxFallback] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsMsg, setSmsMsg] = useState({ text: '', type: '' });

  useEffect(() => {
    // Only superadmins may read platform config; regular admins would just get a 403.
    if (!isSuperadmin) return;
    crmApi.getPlatformConfig().then(res => {
      if (res.ok && res.data) {
        setSmsRate(String(res.data.sms_rate_usd ?? 0.10));
        setFxFallback(String(res.data.usd_inr_fallback ?? 88));
      }
    });
  }, [isSuperadmin]);

  const handleSmsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rate = parseFloat(smsRate);
    if (!isFinite(rate) || rate < 0) {
      return setSmsMsg({ text: 'Rate must be a non-negative number', type: 'error' });
    }
    const fallback = fxFallback.trim() === '' ? undefined : parseFloat(fxFallback);
    if (fallback !== undefined && (!isFinite(fallback) || fallback <= 0)) {
      return setSmsMsg({ text: 'FX fallback must be a positive number', type: 'error' });
    }
    setSmsLoading(true);
    setSmsMsg({ text: '', type: '' });
    const res = await crmApi.updatePlatformConfig({ sms_rate_usd: rate, usd_inr_fallback: fallback });
    if (res.ok) {
      setSmsMsg({ text: 'SMS billing rate saved.', type: 'success' });
    } else {
      setSmsMsg({ text: res.error?.message || 'Failed to save rate', type: 'error' });
    }
    setSmsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      return setMsg({ text: 'New password must be at least 8 characters', type: 'error' });
    }
    setLoading(true);
    setMsg({ text: '', type: '' });
    
    const res = await crmApi.updatePassword({ currentPassword, newPassword });
    if (res.ok) {
      setMsg({ text: 'Password updated successfully.', type: 'success' });
      setCurrentPassword('');
      setNewPassword('');
    } else {
      setMsg({ text: res.error?.message || 'Failed to update password', type: 'error' });
    }
    setLoading(false);
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 24 }}>Settings</h1>
      
      <div className="card" style={{ maxWidth: 500 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Change Password</h2>
        
        {msg.text && (
          <div style={{ padding: 12, borderRadius: 8, marginBottom: 16, fontSize: '0.9rem',
            background: msg.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
            color: msg.type === 'error' ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {msg.text}
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label">Current Password</label>
            <input type="password" required className="input" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
          </div>
          <div>
            <label className="label">New Password (min 8 chars)</label>
            <input type="password" required minLength={8} className="input" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
          </div>
          
          <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>

      {isSuperadmin && (
      <div className="card" style={{ maxWidth: 500, marginTop: 24 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 4 }}>SMS Billing Rate</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted, #888)', marginBottom: 16 }}>
          Per-SMS charge passed through to publishers who enable reader phone (OTP) sign-in.
          Billed monthly, converted USD→INR at the live rate on the billing date.
        </p>

        {smsMsg.text && (
          <div style={{ padding: 12, borderRadius: 8, marginBottom: 16, fontSize: '0.9rem',
            background: smsMsg.type === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)',
            color: smsMsg.type === 'error' ? 'var(--color-danger)' : 'var(--color-success)' }}>
            {smsMsg.text}
          </div>
        )}

        <form onSubmit={handleSmsSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label">Rate (USD per SMS)</label>
            <input type="number" step="0.001" min="0" required className="input" value={smsRate} onChange={e => setSmsRate(e.target.value)} />
          </div>
          <div>
            <label className="label">USD→INR fallback (used only if the live FX lookup fails)</label>
            <input type="number" step="0.01" min="0" className="input" value={fxFallback} onChange={e => setFxFallback(e.target.value)} />
          </div>

          <button type="submit" className="btn-primary" disabled={smsLoading} style={{ marginTop: 8 }}>
            {smsLoading ? 'Saving...' : 'Save Rate'}
          </button>
        </form>
      </div>
      )}
    </div>
  );
}

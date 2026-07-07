import React, { useState } from 'react';
import { crmApi } from '../lib/api';

export function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState({ text: '', type: '' });

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
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { crmApi } from '../lib/api';

export function AdminsPage() {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('admin');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadAdmins = () => {
    setLoading(true);
    crmApi.getAdmins().then(res => {
      if (res.ok) setAdmins(res.data);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadAdmins();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Password must be at least 8 chars');
    
    setCreating(true);
    setError('');
    const res = await crmApi.createAdmin({ email, password, role });
    if (res.ok) {
      setEmail('');
      setPassword('');
      loadAdmins();
    } else {
      setError(res.error?.message || 'Failed to create admin');
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this admin user?')) return;
    const res = await crmApi.deleteAdmin(id);
    if (res.ok) {
      setAdmins(admins.filter(a => a.id !== id));
    } else {
      alert(res.error?.message || 'Failed to delete');
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 24 }}>Manage Admins</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: 24 }}>
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Existing Admins</h2>
          {loading ? (
            <div className="spinner" />
          ) : (
            <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '12px 8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Email</th>
                  <th style={{ padding: '12px 8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Role</th>
                  <th style={{ padding: '12px 8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Created</th>
                  <th style={{ padding: '12px 8px' }}></th>
                </tr>
              </thead>
              <tbody>
                {admins.map(a => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '12px 8px', fontSize: '0.9rem' }}>{a.email}</td>
                    <td style={{ padding: '12px 8px' }}>
                      <span className="badge" style={{
                        background: a.role === 'superadmin' ? 'rgba(124, 58, 237, 0.1)' : 'rgba(255, 255, 255, 0.1)',
                        color: a.role === 'superadmin' ? '#c4b5fd' : 'var(--color-text-secondary)',
                        fontSize: '0.75rem', padding: '4px 8px', borderRadius: 4
                      }}>
                        {a.role}
                      </span>
                    </td>
                    <td style={{ padding: '12px 8px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                    <td style={{ padding: '12px 8px', textAlign: 'right' }}>
                      <button onClick={() => handleDelete(a.id)} style={{ color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {admins.length === 0 && (
                  <tr><td colSpan={4} style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>No admins found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
        
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Invite New Admin</h2>
          {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>}
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="label">Email</label>
              <input type="email" required className="input" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Password</label>
              <input type="password" required minLength={8} className="input" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div>
              <label className="label">Role</label>
              <select className="input" value={role} onChange={e => setRole(e.target.value)}>
                <option value="admin">Admin (View/Edit Tenants only)</option>
                <option value="superadmin">Superadmin (Full Access)</option>
              </select>
            </div>
            <button type="submit" className="btn-primary" disabled={creating} style={{ marginTop: 8 }}>
              {creating ? 'Creating...' : 'Create Admin'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { crmApi } from '../lib/api';

export function TiersPage() {
  const [tiers, setTiers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [name, setName] = useState('');
  const [maxStorageMb, setMaxStorageMb] = useState(1024);
  const [maxViewsPerDay, setMaxViewsPerDay] = useState(1000);
  const [maxSimultaneousEditions, setMaxSimultaneousEditions] = useState(1);
  const [maxPapersPerDay, setMaxPapersPerDay] = useState(1);
  const [razorpayPlanId, setRazorpayPlanId] = useState('');
  
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadTiers = () => {
    setLoading(true);
    crmApi.getTiers().then(res => {
      if (res.ok) setTiers(res.data);
      setLoading(false);
    });
  };

  useEffect(() => {
    loadTiers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    
    const body = {
      name,
      max_storage_mb: maxStorageMb,
      max_views_per_day: maxViewsPerDay,
      max_simultaneous_editions: maxSimultaneousEditions,
      max_papers_per_day: maxPapersPerDay,
      razorpay_plan_id: razorpayPlanId || null,
    };
    
    const res = await crmApi.createTier(body);
    if (res.ok) {
      setName('');
      setRazorpayPlanId('');
      loadTiers();
    } else {
      setError(res.error?.message || 'Failed to create tier');
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this tier?')) return;
    const res = await crmApi.deleteTier(id);
    if (res.ok) {
      setTiers(tiers.filter(t => t.id !== id));
    } else {
      alert(res.error?.message || 'Failed to delete');
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 24 }}>Manage Subscriptions (Tiers)</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 400px', gap: 24 }}>
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Existing Tiers</h2>
          {loading ? (
            <div className="spinner" />
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {tiers.map(t => (
                <div key={t.id} style={{ padding: 16, border: '1px solid var(--color-border)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <h3 style={{ fontSize: '1.1rem', fontWeight: 600, textTransform: 'capitalize' }}>{t.name}</h3>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                        RPay: {t.razorpay_plan_id || 'Not set'}
                      </div>
                    </div>
                    <button onClick={() => handleDelete(t.id)} style={{ color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
                      Delete
                    </button>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                    <div>Storage: <strong>{t.max_storage_mb} MB</strong></div>
                    <div>Views/Day: <strong>{t.max_views_per_day}</strong></div>
                    <div>Simultaneous: <strong>{t.max_simultaneous_editions}</strong></div>
                    <div>Papers/Day: <strong>{t.max_papers_per_day}</strong></div>
                  </div>
                </div>
              ))}
              {tiers.length === 0 && <div style={{ color: 'var(--color-text-muted)' }}>No tiers found</div>}
            </div>
          )}
        </div>
        
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Create Tier</h2>
          {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>}
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="label">Name</label>
              <input type="text" required className="input" placeholder="e.g. basic" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Razorpay Plan ID (Optional)</label>
              <input type="text" className="input" placeholder="plan_xyz123" value={razorpayPlanId} onChange={e => setRazorpayPlanId(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Storage (MB)</label>
                <input type="number" required className="input" value={maxStorageMb} onChange={e => setMaxStorageMb(parseInt(e.target.value))} />
              </div>
              <div>
                <label className="label">Views / Day</label>
                <input type="number" required className="input" value={maxViewsPerDay} onChange={e => setMaxViewsPerDay(parseInt(e.target.value))} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Simultaneous Editions</label>
                <input type="number" required className="input" value={maxSimultaneousEditions} onChange={e => setMaxSimultaneousEditions(parseInt(e.target.value))} />
              </div>
              <div>
                <label className="label">Papers / Day</label>
                <input type="number" required className="input" value={maxPapersPerDay} onChange={e => setMaxPapersPerDay(parseInt(e.target.value))} />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={creating} style={{ marginTop: 8 }}>
              {creating ? 'Creating...' : 'Create Tier'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

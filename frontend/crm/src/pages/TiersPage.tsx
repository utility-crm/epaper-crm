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
  const [priceInr, setPriceInr] = useState(0);
  const [taxPercentage, setTaxPercentage] = useState(0);
  const [includeTax, setIncludeTax] = useState(false);
  const [billingCycle, setBillingCycle] = useState('monthly');
  
  const [editingId, setEditingId] = useState<string | null>(null);
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

  const handleEdit = (tier: any) => {
    setEditingId(tier.id);
    setName(tier.name);
    setMaxStorageMb(tier.max_storage_mb);
    setMaxViewsPerDay(tier.max_views_per_day);
    setMaxSimultaneousEditions(tier.max_simultaneous_editions);
    setMaxPapersPerDay(tier.max_papers_per_day);
    setPriceInr(tier.price_inr || 0);
    setTaxPercentage(tier.tax_percentage || 0);
    setIncludeTax((tier.tax_percentage || 0) > 0);
    setBillingCycle(tier.billing_cycle || 'monthly');
    setError('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setName('');
    setMaxStorageMb(1024);
    setMaxViewsPerDay(1000);
    setMaxSimultaneousEditions(1);
    setMaxPapersPerDay(1);
    setPriceInr(0);
    setTaxPercentage(0);
    setIncludeTax(false);
    setBillingCycle('monthly');
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError('');
    
    const body = {
      name,
      max_storage_mb: maxStorageMb,
      max_views_per_day: maxViewsPerDay,
      max_simultaneous_editions: maxSimultaneousEditions,
      max_papers_per_day: maxPapersPerDay,
      price_inr: priceInr,
      tax_percentage: includeTax ? taxPercentage : 0,
      billing_cycle: billingCycle,
    };
    
    let res;
    if (editingId) {
      res = await crmApi.updateTier(editingId, body);
    } else {
      res = await crmApi.createTier(body);
    }
    
    if (res.ok) {
      handleCancelEdit();
      loadTiers();
    } else {
      setError(res.error?.message || `Failed to ${editingId ? 'update' : 'create'} tier`);
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
                        RPay: {t.razorpay_plan_id || 'Not set'} | Price: ₹{t.price_inr || 0} / {t.billing_cycle || 'monthly'} {t.tax_percentage ? `(+${t.tax_percentage}% tax)` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => handleEdit(t)} style={{ color: 'var(--color-brand-primary)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
                        Edit
                      </button>
                      <button onClick={() => handleDelete(t.id)} style={{ color: 'var(--color-danger)', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem' }}>
                        Delete
                      </button>
                    </div>
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
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>{editingId ? `Edit Tier: ${name}` : 'Create Tier'}</h2>
          {error && <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem', marginBottom: 12 }}>{error}</div>}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="label">Name</label>
              <input type="text" required className="input" placeholder="e.g. basic" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label className="label">Price (INR)</label>
                <input type="number" required className="input" value={priceInr} onChange={e => setPriceInr(parseInt(e.target.value))} />
              </div>
              <div>
                <label className="label">Billing Cycle</label>
                <select className="input" value={billingCycle} onChange={e => setBillingCycle(e.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" checked={includeTax} onChange={e => setIncludeTax(e.target.checked)} />
                Include Taxes
              </label>
              {includeTax && (
                <div style={{ marginTop: 8 }}>
                  <label className="label">Tax Percentage (%)</label>
                  <input type="number" required className="input" value={taxPercentage} onChange={e => setTaxPercentage(parseInt(e.target.value))} />
                </div>
              )}
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
            <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button type="submit" className="btn-primary" disabled={creating} style={{ flex: 1 }}>
                {creating ? 'Saving...' : editingId ? 'Update Tier' : 'Create Tier'}
              </button>
              {editingId && (
                <button type="button" className="btn-secondary" onClick={handleCancelEdit}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

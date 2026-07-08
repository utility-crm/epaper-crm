import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { crmApi } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmModal } from '../components/ConfirmModal';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';

function decodeToken(token: string | null) {
  if (!token) return null;
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); } catch { return null; }
}

export function TenantDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  
  const adminToken = localStorage.getItem('epaper:adminToken');
  const payload = decodeToken(adminToken);
  const isSuperAdmin = payload?.role === 'superadmin';

  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [modal, setModal] = useState<'suspend' | 'release' | 'delete' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  
  const [customLimits, setCustomLimits] = useState({
    storage_mb: 0,
    views_per_day: 0,
    simultaneous_editions: 0,
    papers_per_day: 0
  });
  const [limitsLoading, setLimitsLoading] = useState(false);
  
  const [billingStatus, setBillingStatus] = useState<any>(null);
  const [billingEvents, setBillingEvents] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  
  const [tiers, setTiers] = useState<any[]>([]);

  useEffect(() => {
    if (!slug) return;
    crmApi.getTenant(slug).then(res => {
      if (res.ok) { 
        setTenant(res.data); 
        setSelectedPlan(res.data.plan); 
        setCustomLimits({
          storage_mb: res.data.custom_storage_mb || 0,
          views_per_day: res.data.custom_views_per_day || 0,
          simultaneous_editions: res.data.custom_simultaneous_editions || 0,
          papers_per_day: res.data.custom_papers_per_day || 0
        });
        crmApi.getAuditLog(1, res.data.id).then(aRes => { if (aRes.ok) setAuditLogs(aRes.data.items || []); });
      }
      setLoading(false);
    });
    
    if (isSuperAdmin) {
      crmApi.getPlatformBillingStatus(slug).then(res => { if (res.ok) setBillingStatus(res.data); });
      crmApi.getPlatformBillingEvents(slug).then(res => { if (res.ok) setBillingEvents(res.data); });
      crmApi.getTiers().then(res => { if (res.ok) setTiers(res.data); });
    }
  }, [slug, isSuperAdmin]);

  const auditData = React.useMemo(() => {
    const grouped = auditLogs.reduce((acc, log) => {
      const date = new Date(log.created_at).toLocaleDateString();
      acc[date] = (acc[date] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(grouped).map(([date, count]) => ({ date, count })).reverse();
  }, [auditLogs]);

  const billingData = React.useMemo(() => {
    const grouped = billingEvents.reduce((acc, ev) => {
      const date = new Date(ev.created_at).toLocaleDateString();
      acc[date] = (acc[date] || 0) + (ev.amount_paise / 100);
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(grouped).map(([date, amount]) => ({ date, amount })).reverse();
  }, [billingEvents]);

  const handlePlanChange = async () => {
    if (!slug || selectedPlan === tenant?.plan) return;
    setPlanLoading(true);
    await crmApi.patchTenant(slug, { plan: selectedPlan });
    const res = await crmApi.getTenant(slug);
    if (res.ok) setTenant(res.data);
    setPlanLoading(false);
  };

  const handleSaveLimits = async () => {
    setLimitsLoading(true);
    await crmApi.patchTenant(slug!, {
      custom_storage_mb: customLimits.storage_mb,
      custom_views_per_day: customLimits.views_per_day,
      custom_simultaneous_editions: customLimits.simultaneous_editions,
      custom_papers_per_day: customLimits.papers_per_day,
    });
    setLimitsLoading(false);
  };

  const handleSuspend = async () => {
    setActionLoading(true);
    await crmApi.patchTenant(slug!, { status: 'suspended' });
    const res = await crmApi.getTenant(slug!);
    if (res.ok) setTenant(res.data);
    setActionLoading(false);
    setModal(null);
  };

  const handleRelease = async () => {
    setActionLoading(true);
    await crmApi.patchTenant(slug!, { status: 'active' });
    const res = await crmApi.getTenant(slug!);
    if (res.ok) setTenant(res.data);
    setActionLoading(false);
    setModal(null);
  };

  const handleDelete = async () => {
    setActionLoading(true);
    await crmApi.deleteTenant(slug!);
    setActionLoading(false);
    setModal(null);
    navigate('/tenants');
  };

  const handleReprovision = async () => {
    setActionLoading(true);
    await crmApi.reprovisionTenant(slug!);
    const res = await crmApi.getTenant(slug!);
    if (res.ok) setTenant(res.data);
    setActionLoading(false);
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}><div className="spinner" /></div>;
  if (!tenant) return <div className="card">Tenant not found</div>;

  return (
    <>
      {modal === 'suspend' && (
        <ConfirmModal
          title="Suspend Organisation"
          message={`Suspending "${tenant.name}" will immediately block all access. You can reverse this later.`}
          confirmLabel="Suspend Now"
          confirmClass="btn-danger"
          onConfirm={handleSuspend}
          onCancel={() => setModal(null)}
          loading={actionLoading}
        />
      )}
      {modal === 'release' && (
        <ConfirmModal
          title="Release Suspension"
          message={`Are you sure you want to release the suspension for "${tenant.name}"? They will regain access to the platform.`}
          confirmLabel="Release Suspension"
          confirmClass="btn-primary"
          onConfirm={handleRelease}
          onCancel={() => setModal(null)}
          loading={actionLoading}
        />
      )}
      {modal === 'delete' && (
        <ConfirmModal
          title="Permanently Delete Organisation"
          message={`This will destroy all data for "${tenant.name}" — D1 database, R2 bucket, and all editions. This is IRREVERSIBLE.`}
          confirmLabel="Delete Forever"
          confirmClass="btn-danger"
          onConfirm={handleDelete}
          onCancel={() => setModal(null)}
          loading={actionLoading}
        />
      )}

      <div style={{ marginBottom: 28 }}>
        <button className="btn-secondary" style={{ fontSize: '0.8rem', marginBottom: 16 }}
          onClick={() => navigate('/tenants')}>← Back to Tenants</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700 }}>{tenant.name}</h1>
          <StatusBadge status={tenant.status} />
        </div>
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', marginTop: 4 }}>
          {tenant.slug}
        </p>
      </div>

      {/* Stuck in PROVISIONING Banner (for admins) */}
      {tenant.status === 'provisioning' && (
        <div style={{ marginBottom: 20, padding: '16px 20px', background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.3)', borderRadius: 12, display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, color: '#fcd34d', marginBottom: 4 }}>⏱ Provisioning In Progress</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              If this has been running for more than 5 minutes, the GitHub Actions job may have stalled.
              Use <strong>Force Activate</strong> only if you know the D1 DB and R2 bucket were created successfully.
              Use <strong>Re-Provision</strong> to trigger a fresh run.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              className="btn-secondary"
              disabled={actionLoading}
              onClick={handleReprovision}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
            >
              {actionLoading && <span className="spinner" style={{ width: 12, height: 12 }} />}
              ↻ Re-Provision
            </button>
            <button
              className="btn-primary"
              disabled={actionLoading}
              onClick={async () => {
                setActionLoading(true);
                // Manually activate — use when job succeeded but webhook didn't fire
                await fetch(`/api/tenants/internal/${slug}/activate`, {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('epaper:adminToken')}`
                  },
                  body: JSON.stringify({ d1_id: `epaper-${slug}`, r2_bucket: `epaper-${slug}` })
                });
                const res = await crmApi.getTenant(slug!);
                if (res.ok) setTenant(res.data);
                setActionLoading(false);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
            >
              ✓ Force Activate
            </button>
          </div>
        </div>
      )}

      {/* Provision Failed Banner */}
      {tenant.status === 'provision_failed' && (
        <div style={{ marginBottom: 20, padding: '16px 20px', background: 'rgba(220,38,38,0.08)',
          border: '1px solid rgba(220,38,38,0.3)', borderRadius: 12, display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, color: '#fca5a5', marginBottom: 4 }}>⚠ Provisioning Failed</div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
              The GitHub Actions workflow failed to provision this tenant. Resources have been rolled back. You can safely re-trigger provisioning.
            </div>
          </div>
          <button
            className="btn-primary"
            disabled={actionLoading}
            onClick={handleReprovision}
            style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}
          >
            {actionLoading && <span className="spinner" style={{ width: 14, height: 14 }} />}
            ↻ Re-Provision
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isSuperAdmin ? '1fr 1fr' : '1fr', gap: 20, marginBottom: 20 }}>
        {/* Info Card */}
        <div className="card">
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 20 }}>Organisation Details</h2>
          <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '12px 16px', alignItems: 'start' }}>
            {[
              ['Email', tenant.email],
              ['Created', new Date(tenant.created_at).toLocaleString()],
              ['D1 Database', tenant.d1_id ?? 'Not provisioned'],
              ['R2 Bucket', tenant.r2_bucket ?? 'Not provisioned'],
              ['Provision Run', tenant.provision_run_id
                ? <a href={`https://github.com/actions/runs/${tenant.provision_run_id}`} target="_blank" rel="noreferrer"
                    style={{ color: 'var(--color-brand-primary)' }}>#{tenant.provision_run_id}</a>
                : '—'],
            ].map(([label, value]) => (
              <React.Fragment key={String(label)}>
                <dt style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', paddingTop: 2 }}>{label}</dt>
                <dd style={{ color: 'var(--color-text-primary)', fontFamily: typeof value === 'string' && value.startsWith('epa') ? 'var(--font-mono)' : undefined, fontSize: '0.875rem' }}>{value}</dd>
              </React.Fragment>
            ))}
          </dl>
        </div>

        {/* Plan Card (Superadmin only) */}
        {isSuperAdmin && (
          <div className="card">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 20 }}>Plan & Billing</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20, padding: 16, background: 'var(--color-bg-elevated)', borderRadius: 8 }}>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>Current Subscription</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: '1.1rem', fontWeight: 600, textTransform: 'capitalize' }}>{tenant.plan}</span>
                  {billingStatus?.has_subscription && (
                    <span className="badge" style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--color-success)', padding: '2px 6px', fontSize: '0.7rem' }}>
                      {billingStatus.razorpay_status || 'Active'}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginBottom: 4 }}>Razorpay ID</div>
                <div style={{ fontSize: '0.85rem', fontFamily: 'var(--font-mono)' }}>{tenant.razorpay_sub_id || 'Not subscribed'}</div>
              </div>
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <label className="label">Change Tier</label>
              <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)}
                style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)',
                  color: 'var(--color-text-primary)', padding: '10px 14px', borderRadius: 8, fontFamily: 'var(--font-sans)', outline: 'none' }}>
                {tiers.map(t => <option key={t.name} value={t.name}>{t.name.charAt(0).toUpperCase() + t.name.slice(1)}</option>)}
                {!tiers.find(t => t.name === selectedPlan) && <option value={selectedPlan}>{selectedPlan} (Legacy)</option>}
              </select>
            </div>
            <button className="btn-primary" disabled={planLoading || selectedPlan === tenant.plan} onClick={handlePlanChange}>
              {planLoading ? 'Updating…' : 'Update Plan'}
            </button>
          </div>
        )}

        {/* Custom Limits Card (Enterprise Only) */}
        {isSuperAdmin && tenant.plan.toLowerCase() === 'enterprise' && (
          <div className="card">
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 20 }}>Enterprise Custom Limits</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <label className="label">Storage (MB)</label>
                <input className="input" type="number" value={customLimits.storage_mb} onChange={e => setCustomLimits(c => ({...c, storage_mb: parseInt(e.target.value) || 0}))} />
              </div>
              <div>
                <label className="label">Views per Day</label>
                <input className="input" type="number" value={customLimits.views_per_day} onChange={e => setCustomLimits(c => ({...c, views_per_day: parseInt(e.target.value) || 0}))} />
              </div>
              <div>
                <label className="label">Simultaneous Editions</label>
                <input className="input" type="number" value={customLimits.simultaneous_editions} onChange={e => setCustomLimits(c => ({...c, simultaneous_editions: parseInt(e.target.value) || 0}))} />
              </div>
              <div>
                <label className="label">Papers per Day</label>
                <input className="input" type="number" value={customLimits.papers_per_day} onChange={e => setCustomLimits(c => ({...c, papers_per_day: parseInt(e.target.value) || 0}))} />
              </div>
            </div>
            <button className="btn-primary" disabled={limitsLoading} onClick={handleSaveLimits}>
              {limitsLoading ? 'Saving...' : 'Save Limits'}
            </button>
          </div>
        )}
      </div>
      
      {/* Visualizations */}
      <div style={{ display: 'grid', gridTemplateColumns: isSuperAdmin ? '1fr 1fr' : '1fr', gap: 20, marginBottom: 20 }}>
        {isSuperAdmin && (
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Platform Billing Revenue (INR)</h2>
            <div style={{ height: 250, width: '100%' }}>
              {billingData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={billingData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} />
                    <YAxis stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `₹${val}`} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 8, color: '#fff' }} />
                    <Bar dataKey="amount" fill="var(--color-brand-primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>No billing events</div>
              )}
            </div>
          </div>
        )}
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Audit Activity Trends</h2>
          <div style={{ height: 250, width: '100%' }}>
            {auditData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={auditData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={12} tickLine={false} />
                  <YAxis stroke="var(--color-text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)', borderRadius: 8, color: '#fff' }} />
                  <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)' }}>No audit logs</div>
            )}
          </div>
        </div>
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: isSuperAdmin ? '1fr 1fr' : '1fr', gap: 20, marginBottom: 20 }}>
        {isSuperAdmin && (
          <div className="card">
            <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Billing Events Log</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Date</th>
                    <th style={{ padding: '8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Event</th>
                    <th style={{ padding: '8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {billingEvents.slice(0, 10).map(ev => (
                    <tr key={ev.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '8px', fontSize: '0.85rem' }}>{new Date(ev.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: '8px', fontSize: '0.85rem' }}>{ev.event_type}</td>
                      <td style={{ padding: '8px', fontSize: '0.85rem', fontWeight: 600 }}>₹{(ev.amount_paise / 100).toFixed(2)}</td>
                    </tr>
                  ))}
                  {billingEvents.length === 0 && (
                    <tr><td colSpan={3} style={{ padding: 12, textAlign: 'center', color: 'var(--color-text-muted)' }}>No billing events found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16 }}>Recent Audit Logs</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={{ padding: '8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Date</th>
                  <th style={{ padding: '8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Action</th>
                  <th style={{ padding: '8px', color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.slice(0, 10).map(log => (
                  <tr key={log.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '8px', fontSize: '0.85rem', color: 'var(--color-text-muted)' }}>{new Date(log.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: '8px', fontSize: '0.85rem' }}>
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.1)', padding: '2px 6px', borderRadius: 4 }}>{log.action}</span>
                    </td>
                    <td style={{ padding: '8px', fontSize: '0.85rem' }}>{log.details}</td>
                  </tr>
                ))}
                {auditLogs.length === 0 && (
                  <tr><td colSpan={3} style={{ padding: 12, textAlign: 'center', color: 'var(--color-text-muted)' }}>No audit logs found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      {!['deleted', 'deleting'].includes(tenant.status) && (
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.3)' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 16, color: 'var(--color-danger)' }}>Danger Zone</h2>
          <div style={{ display: 'flex', gap: 12 }}>
            {tenant.status === 'active' && (
              <button style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--color-warning)', border: '1px solid rgba(245,158,11,0.4)',
                padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => setModal('suspend')}>Suspend Organisation</button>
            )}
            {tenant.status === 'suspended' && (
              <button style={{ background: 'rgba(16,185,129,0.1)', color: 'var(--color-success)', border: '1px solid rgba(16,185,129,0.4)',
                padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
                onClick={() => setModal('release')}>Release Suspension</button>
            )}
            <button style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.4)',
              padding: '10px 20px', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
              onClick={() => setModal('delete')}>Delete Organisation</button>
          </div>
        </div>
      )}
    </>
  );
}

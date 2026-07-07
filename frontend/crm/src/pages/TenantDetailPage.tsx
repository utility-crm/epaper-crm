import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { crmApi } from '../lib/api';
import { StatusBadge } from '../components/StatusBadge';
import { ConfirmModal } from '../components/ConfirmModal';

const PLANS = ['starter', 'growth', 'enterprise'];

export function TenantDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [planLoading, setPlanLoading] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState('');
  const [modal, setModal] = useState<'suspend' | 'release' | 'delete' | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (!slug) return;
    crmApi.getTenant(slug).then(res => {
      if (res.ok) { setTenant(res.data); setSelectedPlan(res.data.plan); }
      setLoading(false);
    });
  }, [slug]);

  const handlePlanChange = async () => {
    if (!slug || selectedPlan === tenant?.plan) return;
    setPlanLoading(true);
    await crmApi.patchTenant(slug, { plan: selectedPlan });
    const res = await crmApi.getTenant(slug);
    if (res.ok) setTenant(res.data);
    setPlanLoading(false);
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Info Card */}
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 20 }}>Organisation Details</h2>
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

        {/* Plan Card */}
        <div className="card">
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 20 }}>Plan Management</h2>
          <div style={{ marginBottom: 16 }}>
            <label className="label">Current Plan</label>
            <select value={selectedPlan} onChange={e => setSelectedPlan(e.target.value)}
              style={{ width: '100%', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--color-border)',
                color: 'var(--color-text-primary)', padding: '10px 14px', borderRadius: 8, fontFamily: 'var(--font-sans)', outline: 'none' }}>
              {PLANS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
            </select>
          </div>
          <button className="btn-primary" disabled={planLoading || selectedPlan === tenant.plan} onClick={handlePlanChange}>
            {planLoading ? 'Updating…' : 'Update Plan'}
          </button>
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

import React, { useState } from 'react';
import { StatusBadge } from './StatusBadge';
import { ConfirmModal } from './ConfirmModal';

interface Tenant {
  id: string;
  slug: string;
  name: string;
  email: string;
  plan: string;
  status: string;
  created_at: string;
}

interface TenantTableProps {
  tenants: Tenant[];
  onView: (slug: string) => void;
  onSuspend: (slug: string) => Promise<void>;
  onDelete: (slug: string) => Promise<void>;
}

export function TenantTable({ tenants, onView, onSuspend, onDelete }: TenantTableProps) {
  const [pendingAction, setPendingAction] = useState<{ type: 'suspend' | 'delete'; slug: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!pendingAction) return;
    setLoading(true);
    try {
      if (pendingAction.type === 'suspend') await onSuspend(pendingAction.slug);
      else await onDelete(pendingAction.slug);
    } finally {
      setLoading(false);
      setPendingAction(null);
    }
  };

  return (
    <>
      {pendingAction && (
        <ConfirmModal
          title={pendingAction.type === 'delete' ? 'Delete Organisation' : 'Suspend Organisation'}
          message={
            pendingAction.type === 'delete'
              ? `This will permanently delete all data for "${pendingAction.slug}" including their D1 database and R2 bucket. This action cannot be undone.`
              : `This will immediately block "${pendingAction.slug}" from accessing their account. You can unsuspend them later.`
          }
          confirmLabel={pendingAction.type === 'delete' ? 'Delete Forever' : 'Suspend'}
          confirmClass="btn-danger"
          onConfirm={handleConfirm}
          onCancel={() => setPendingAction(null)}
          loading={loading}
        />
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Organisation</th>
              <th>Plan</th>
              <th>Status</th>
              <th>Joined</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-muted)' }}>
                  No tenants found
                </td>
              </tr>
            ) : tenants.map(t => (
              <tr key={t.id}>
                <td>
                  <div style={{ fontWeight: 500 }}>{t.name}</div>
                  <div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)' }}>{t.slug}</div>
                </td>
                <td style={{ textTransform: 'capitalize' }}>{t.plan}</td>
                <td><StatusBadge status={t.status} /></td>
                <td style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                  {new Date(t.created_at).toLocaleDateString()}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                      onClick={() => onView(t.slug)}>View</button>
                    {t.status === 'active' && (
                      <button style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(245,158,11,0.12)',
                        color: 'var(--color-warning)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, cursor: 'pointer' }}
                        onClick={() => setPendingAction({ type: 'suspend', slug: t.slug })}>Suspend</button>
                    )}
                    {!['deleted', 'deleting'].includes(t.status) && (
                      <button style={{ padding: '6px 12px', fontSize: '0.8rem', background: 'rgba(239,68,68,0.12)',
                        color: 'var(--color-danger)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, cursor: 'pointer' }}
                        onClick={() => setPendingAction({ type: 'delete', slug: t.slug })}>Delete</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

import React from 'react';

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmClass?: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  confirmClass = 'btn-danger',
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmModalProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div className="card" style={{ width: 420, padding: 32 }}>
        <h2 style={{ marginBottom: 12, color: 'var(--color-text-primary)' }}>{title}</h2>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: 28, lineHeight: 1.6 }}>{message}</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onCancel} disabled={loading}>Cancel</button>
          <button className={confirmClass} onClick={onConfirm} disabled={loading} style={{
            padding: '10px 20px', borderRadius: 8, fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1
          }}>
            {loading ? 'Processing…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

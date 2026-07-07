import React, { useEffect, useState, useCallback } from 'react';
import { portalApi } from '../lib/api';
import { Link } from 'react-router-dom';

interface EditionsPageProps {
  slug: string;
  token: string;
}

function CreateModal({ slug, token, onClose }: { slug: string; token: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    setError('');
    setLoading(true);
    try {
      const createRes = await portalApi.createEdition(slug, { title }, token);
      if (!createRes.ok || !createRes.data?.id) {
        setError(createRes.error?.message ?? 'Failed to create edition');
        return;
      }
      onClose();
    } catch {
      setError('Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: 500, padding: 36 }}>
        <form onSubmit={handleSubmit}>
          <h2 style={{ marginBottom: 24 }}>New Edition</h2>
          <div style={{ marginBottom: 24 }}>
            <label className="label">Title</label>
            <input className="input" required value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Daily Times" />
          </div>
          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: 'var(--color-danger)', fontSize: '0.875rem', marginBottom: 16 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 12 }}>
            <button className="btn-primary" type="submit" disabled={loading} style={{ flex: 1 }}>Create Edition</button>
            <button className="btn-secondary" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditionsPage({ slug, token }: EditionsPageProps) {
  const [editions, setEditions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await portalApi.getEditions(slug, token);
    if (res.ok && res.data) setEditions(res.data.items ?? []);
    setLoading(false);
  }, [slug, token]);

  useEffect(() => { load(); }, [load]);

  const handleModalClose = () => { setShowModal(false); load(); };

  return (
    <>
      {showModal && <CreateModal slug={slug} token={token} onClose={handleModalClose} />}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>Editions</h1>
            <p style={{ color: 'var(--color-text-secondary)' }}>Manage your publication titles</p>
          </div>
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Edition</button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : editions.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>📰</div>
            <h2 style={{ marginBottom: 12 }}>No editions yet</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>Create your first edition to get started</p>
            <button className="btn-primary" onClick={() => setShowModal(true)}>Create First Edition</button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Status</th>
                  <th>Created At</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {editions.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 500 }}>{e.title}</td>
                    <td><span className={`status-badge status-${e.status}`}>{e.status}</span></td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{new Date(e.created_at).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <Link to={`/portal/editions/${e.id}/epapers`} className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.85rem', textDecoration: 'none', display: 'inline-block' }}>
                        Manage e-Papers
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

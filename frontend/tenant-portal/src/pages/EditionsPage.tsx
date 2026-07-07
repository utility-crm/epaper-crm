import React, { useEffect, useState, useCallback } from 'react';
import { portalApi } from '../lib/api';

interface EditionsPageProps {
  slug: string;
  token: string;
}

function UploadModal({ slug, token, onClose }: { slug: string; token: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [publishDate, setPublishDate] = useState(new Date().toISOString().split('T')[0]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'form' | 'uploading' | 'done'>('form');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    setError('');
    setLoading(true);
    setStep('uploading');
    try {
      const createRes = await portalApi.createEdition(slug, { title, publish_date: publishDate }, token);
      if (!createRes.ok || !createRes.data?.id) {
        setError(createRes.error?.message ?? 'Failed to create edition');
        setStep('form');
        setLoading(false);
        return;
      }
      const editionId = createRes.data.id;

      if (file) {
        const upRes = await portalApi.uploadPdf(slug, editionId, file, token);
        if (!upRes.ok) {
          setError(upRes.error?.message ?? 'Failed to upload PDF');
          setStep('form');
          setLoading(false);
          return;
        }
      }

      setStep('done');
      setTimeout(onClose, 1500);
    } catch {
      setError('Unexpected error');
      setStep('form');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div className="card" style={{ width: 500, padding: 36 }}>
        {step === 'done' ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
            <h2>Edition Created!</h2>
          </div>
        ) : step === 'uploading' ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div className="spinner" style={{ margin: '0 auto 20px' }} />
            <h2>Uploading…</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: 8 }}>Streaming PDF to edge storage</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 style={{ marginBottom: 24 }}>New Edition</h2>
            <div style={{ marginBottom: 16 }}>
              <label className="label">Title</label>
              <input className="input" required value={title} onChange={e => setTitle(e.target.value)} placeholder="Monday Morning Edition" />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label className="label">Publish Date</label>
              <input className="input" type="date" required value={publishDate} onChange={e => setPublishDate(e.target.value)} />
            </div>
            <div style={{ marginBottom: 24 }}>
              <label className="label">PDF File (optional — upload later)</label>
              <div style={{ border: `2px dashed ${file ? 'var(--color-brand-primary)' : 'var(--color-border)'}`, borderRadius: 10,
                padding: 24, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: file ? 'rgba(99,102,241,0.05)' : 'rgba(0,0,0,0.1)' }}
                onClick={() => document.getElementById('pdf-input')!.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') setFile(f); }}>
                <input id="pdf-input" type="file" accept="application/pdf" style={{ display: 'none' }}
                  onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); }} />
                {file ? (
                  <><div style={{ fontSize: '1.5rem', marginBottom: 6 }}>📄</div><div style={{ fontWeight: 500 }}>{file.name}</div><div style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>{(file.size / 1024 / 1024).toFixed(1)} MB</div></>
                ) : (
                  <><div style={{ fontSize: '1.5rem', marginBottom: 8 }}>☁️</div><div style={{ color: 'var(--color-text-secondary)' }}>Drag & drop PDF, or click to browse</div></>
                )}
              </div>
            </div>
            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: 'var(--color-danger)', fontSize: '0.875rem', marginBottom: 16 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn-primary" type="submit" disabled={loading} style={{ flex: 1 }}>Create Edition</button>
              <button className="btn-secondary" type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
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
      {showModal && <UploadModal slug={slug} token={token} onClose={handleModalClose} />}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>Editions</h1>
            <p style={{ color: 'var(--color-text-secondary)' }}>Publish and manage your digital newspaper issues</p>
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
                  <th>Publish Date</th>
                  <th>PDF</th>
                </tr>
              </thead>
              <tbody>
                {editions.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 500 }}>{e.title}</td>
                    <td><span className={`status-badge status-${e.status}`}>{e.status}</span></td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{e.publish_date}</td>
                    <td>{e.r2_key ? <span style={{ color: 'var(--color-success)', fontSize: '0.8rem' }}>✓ Uploaded</span> : <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>No PDF</span>}</td>
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

import React, { useEffect, useState, useCallback } from 'react';
import { portalApi } from '../lib/api';
import { useParams, Link } from 'react-router-dom';

interface EpapersPageProps {
  slug: string;
  token: string;
}

function UploadPdfModal({ slug, token, epaperId, publishDate, onClose }: { slug: string; token: string; epaperId: string; publishDate: string; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'form' | 'uploading' | 'done'>('form');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setError('');
    setLoading(true);
    setStep('uploading');
    try {
      const upRes = await portalApi.uploadPdf(slug, epaperId, file, token);
      if (!upRes.ok) {
        setError(upRes.error?.message ?? 'Failed to upload PDF');
        setStep('form');
        setLoading(false);
        return;
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
            <h2>PDF Uploaded!</h2>
          </div>
        ) : step === 'uploading' ? (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div className="spinner" style={{ margin: '0 auto 20px' }} />
            <h2>Uploading…</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginTop: 8 }}>Streaming PDF to edge storage</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2 style={{ marginBottom: 8 }}>Upload PDF</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>For date: <span style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{publishDate}</span></p>
            
            <div style={{ marginBottom: 24 }}>
              <div style={{ border: `2px dashed ${file ? 'var(--color-brand-primary)' : 'var(--color-border)'}`, borderRadius: 10,
                padding: 24, textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', background: file ? 'rgba(99,102,241,0.05)' : 'rgba(0,0,0,0.1)' }}
                onClick={() => document.getElementById('pdf-update-input')!.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') setFile(f); }}>
                <input id="pdf-update-input" type="file" accept="application/pdf" style={{ display: 'none' }}
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
              <button className="btn-primary" type="submit" disabled={loading || !file} style={{ flex: 1 }}>Upload PDF</button>
              <button className="btn-secondary" type="button" onClick={onClose}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function CreateEpaperModal({ slug, token, editionId, onClose }: { slug: string; token: string; editionId: string; onClose: () => void }) {
  const [publishDate, setPublishDate] = useState(new Date().toISOString().split('T')[0]);
  const [isFree, setIsFree] = useState(false);
  const [publishType, setPublishType] = useState('instant');
  const [scheduledAt, setScheduledAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!publishDate) return;
    setError('');
    setLoading(true);
    try {
      const res = await portalApi.createEpaper(slug, editionId, { publish_date: publishDate, is_free: isFree, publish_type: publishType, scheduled_at: publishType === 'scheduled' ? new Date(scheduledAt).toISOString() : null }, token);
      if (!res.ok) {
        setError(res.error?.message ?? 'Failed to create epaper');
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
          <h2 style={{ marginBottom: 24 }}>New e-Paper Issue</h2>
          
          <div style={{ marginBottom: 16 }}>
            <label className="label">Publish Date</label>
            <input className="input" type="date" required value={publishDate} onChange={e => setPublishDate(e.target.value)} />
          </div>

          <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <input type="checkbox" id="isFree" checked={isFree} onChange={e => setIsFree(e.target.checked)} />
            <label htmlFor="isFree" style={{ margin: 0, fontWeight: 500 }}>Free Edition (No Paywall)</label>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label">Publishing Strategy</label>
            <select className="input" value={publishType} onChange={e => setPublishType(e.target.value)}>
              <option value="instant">Instant Publish</option>
              <option value="scheduled">Schedule for Later</option>
            </select>
          </div>

          {publishType === 'scheduled' && (
            <div style={{ marginBottom: 24 }}>
              <label className="label">Schedule Time</label>
              <input className="input" type="datetime-local" required value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
            </div>
          )}

          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '10px 14px', color: 'var(--color-danger)', fontSize: '0.875rem', marginBottom: 16 }}>{error}</div>}
          <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
            <button className="btn-primary" type="submit" disabled={loading} style={{ flex: 1 }}>Create Issue</button>
            <button className="btn-secondary" type="button" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EpapersPage({ slug, token }: EpapersPageProps) {
  const { editionId } = useParams<{ editionId: string }>();
  const [epapers, setEpapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPdfModal, setShowPdfModal] = useState<{ id: string; publishDate: string } | null>(null);

  const load = useCallback(async () => {
    if (!editionId) return;
    setLoading(true);
    const res = await portalApi.getEpapers(slug, editionId, token);
    if (res.ok && res.data) setEpapers(res.data.items ?? []);
    setLoading(false);
  }, [slug, editionId, token]);

  useEffect(() => { load(); }, [load]);

  const handleModalClose = () => { setShowModal(false); load(); };
  const handlePdfModalClose = () => { setShowPdfModal(null); load(); };

  if (!editionId) return <div>Missing edition ID</div>;

  return (
    <>
      {showModal && <CreateEpaperModal slug={slug} token={token} editionId={editionId} onClose={handleModalClose} />}
      {showPdfModal && <UploadPdfModal slug={slug} token={token} epaperId={showPdfModal.id} publishDate={showPdfModal.publishDate} onClose={handlePdfModalClose} />}
      
      <div>
        <div style={{ marginBottom: 20 }}>
          <Link to="/portal/editions" style={{ color: 'var(--color-brand-primary)', textDecoration: 'none', fontWeight: 500 }}>
            ← Back to Editions
          </Link>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 6 }}>Manage e-Papers</h1>
            <p style={{ color: 'var(--color-text-secondary)' }}>Upload and schedule daily issues for this edition</p>
          </div>
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ New Issue</button>
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
        ) : epapers.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>🗞️</div>
            <h2 style={{ marginBottom: 12 }}>No issues yet</h2>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: 24 }}>Create the first issue for this edition</p>
            <button className="btn-primary" onClick={() => setShowModal(true)}>Create First Issue</button>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Publish Date</th>
                  <th>Status</th>
                  <th>Access</th>
                  <th>Strategy</th>
                  <th>PDF File</th>
                </tr>
              </thead>
              <tbody>
                {epapers.map(e => (
                  <tr key={e.id}>
                    <td style={{ fontWeight: 500 }}>{new Date(e.publish_date).toLocaleDateString()}</td>
                    <td><span className={`status-badge status-${e.status}`}>{e.status}</span></td>
                    <td>{e.is_free ? 'Free' : 'Premium'}</td>
                    <td>
                      {e.publish_type === 'scheduled' 
                        ? `Scheduled (${new Date(e.scheduled_at).toLocaleDateString()})` 
                        : 'Instant'}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {e.r2_key ? <span style={{ color: 'var(--color-success)', fontSize: '0.8rem' }}>✓ Uploaded</span> : <span style={{ color: 'var(--color-text-muted)', fontSize: '0.8rem' }}>No PDF</span>}
                        <button className="btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem', borderRadius: 6 }} onClick={() => setShowPdfModal({ id: e.id, publishDate: new Date(e.publish_date).toLocaleDateString() })}>
                          {e.r2_key ? 'Update PDF' : 'Upload PDF'}
                        </button>
                      </div>
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

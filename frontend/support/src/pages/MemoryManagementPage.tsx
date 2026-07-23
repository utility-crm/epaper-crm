import React, { useState, useEffect } from 'react';

interface MemoryItem {
  id: string;
  tenant_id: string;
  title: string;
  content_text: string;
  created_at: string;
}

export const MemoryManagementPage: React.FC = () => {
  const [tenantId, setTenantId] = useState('epaperspace');
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchMemories = async () => {
    try {
      const resp = await fetch(`http://localhost:8787/api/memory?tenantId=${encodeURIComponent(tenantId)}`);
      const data = await resp.json();
      if (data.memories) {
        setMemories(data.memories);
      }
    } catch {
      setMemories([
        {
          id: 'mem-1',
          tenant_id: tenantId,
          title: 'Subscription Policy & Refunds',
          content_text: 'Monthly readers can request a full refund within 7 days of payment. Annual subscribers within 14 days.',
          created_at: new Date().toISOString(),
        },
        {
          id: 'mem-2',
          tenant_id: tenantId,
          title: 'ePaper Reader Navigation',
          content_text: 'Use arrow keys or swipe left/right to change pages. Click any article headline to open clean reader mode.',
          created_at: new Date().toISOString(),
        },
      ]);
    }
  };

  useEffect(() => {
    void fetchMemories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;

    setLoading(true);
    try {
      await fetch('http://localhost:8787/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          title,
          content,
        }),
      });
      setTitle('');
      setContent('');
      fetchMemories();
    } catch {
      setMemories((prev) => [
        {
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          title,
          content_text: content,
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
      setTitle('');
      setContent('');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`http://localhost:8787/api/memory/${id}?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'DELETE',
      });
    } catch {
      // Keep going
    }
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div style={{ padding: '32px', maxWidth: '1000px', margin: '0 auto', color: '#f8fafc' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Organization AI Knowledge Base</h1>
          <p style={{ color: '#94a3b8', margin: '6px 0 0 0', fontSize: '14px' }}>
            Customize your publication's RAG memory stored in Cloudflare Vectorize + D1 for Llama 3.1 8B instant answers.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <label style={{ fontSize: '13px', color: '#cbd5e1' }}>Tenant ID:</label>
          <input
            type="text"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '6px',
              padding: '8px 12px',
              color: '#fff',
              fontWeight: 600
            }}
          />
        </div>
      </div>

      {/* Add new knowledge form */}
      <form onSubmit={handleAddMemory} style={{ background: '#1e293b', padding: '24px', borderRadius: '12px', border: '1px solid #334155', marginBottom: '32px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px' }}>Add FAQ or Publication Policy</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <input
            type="text"
            placeholder="Title (e.g., Refund Policy, Digital Archive Access)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#fff',
              fontSize: '14px'
            }}
          />
          <textarea
            placeholder="Knowledge content / rules for edge Llama 3.1 model..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '10px 14px',
              color: '#fff',
              fontSize: '14px'
            }}
          />
          <div>
            <button
              type="submit"
              disabled={loading}
              style={{
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              {loading ? 'Vectorizing & Saving...' : 'Add Knowledge to Vectorize'}
            </button>
          </div>
        </div>
      </form>

      {/* Existing memories */}
      <div>
        <h3 style={{ fontSize: '18px', marginBottom: '16px' }}>Active Knowledge Chunks ({memories.length})</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {memories.map((m) => (
            <div
              key={m.id}
              style={{
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start'
              }}
            >
              <div>
                <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '6px' }}>{m.title}</div>
                <div style={{ color: '#cbd5e1', fontSize: '14px', lineHeight: 1.5 }}>{m.content_text}</div>
              </div>
              <button
                onClick={() => handleDelete(m.id)}
                style={{
                  background: '#7f1d1d',
                  color: '#fff',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px'
                }}
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const ChatbotWidget: React.FC<{
  tenantId?: string;
  customDomain?: string;
}> = ({ tenantId = 'epaperspace', customDomain }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Hello! I am the AI Support Assistant for ${tenantId}. Ask me any question or tell me if you need help or a refund.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [ticketCreated, setTicketCreated] = useState<{
    id: string;
    ticketNumber: number;
    category: string;
    refundEligible: boolean | null;
  } | null>(null);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const resp = await fetch('http://localhost:8787/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          messages: newMessages,
          userEmail: userEmail || 'reader@example.com',
          tenantId,
          customDomain,
        }),
      });

      const data = await resp.json();
      if (data.reply) {
        setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      }
      if (data.ticketCreated) {
        setTicketCreated(data.ticketCreated);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Sorry, I encountered an error connecting to edge AI.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderRadius: '16px',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      height: '520px',
      width: '100%',
      maxWidth: '400px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
    }}>
      <div style={{
        background: '#2563eb',
        padding: '16px',
        color: '#fff',
        fontWeight: 600,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>AI Support Assistant ({tenantId})</span>
        <span style={{ fontSize: '11px', background: '#1d4ed8', padding: '4px 8px', borderRadius: '12px' }}>
          Edge AI RAG
        </span>
      </div>

      <div style={{ padding: '8px 16px', background: '#0f172a', borderBottom: '1px solid #334155' }}>
        <input
          type="email"
          placeholder="Your Email (for ticket reply)"
          value={userEmail}
          onChange={(e) => setUserEmail(e.target.value)}
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            color: '#94a3b8',
            fontSize: '13px',
            outline: 'none'
          }}
        />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              background: m.role === 'user' ? '#3b82f6' : '#334155',
              color: '#fff',
              padding: '10px 14px',
              borderRadius: '12px',
              maxWidth: '85%',
              fontSize: '14px',
              lineHeight: 1.4
            }}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{ alignSelf: 'flex-start', color: '#94a3b8', fontSize: '13px' }}>
            Edge AI thinking (<span style={{ color: '#60a5fa' }}>Cloudflare Llama 3.1</span>)...
          </div>
        )}
        {ticketCreated && (
          <div style={{
            background: '#065f46',
            border: '1px solid #059669',
            borderRadius: '12px',
            padding: '12px',
            color: '#ecfdf5',
            fontSize: '13px'
          }}>
            <div style={{ fontWeight: 600 }}>Ticket #{ticketCreated.ticketNumber} Raised!</div>
            <div>Category: {ticketCreated.category}</div>
            {ticketCreated.refundEligible !== null && (
              <div>Refund Eligibility: {ticketCreated.refundEligible ? 'Verified Eligible' : 'Manual Review'}</div>
            )}
          </div>
        )}
      </div>

      <form onSubmit={handleSend} style={{ display: 'flex', borderTop: '1px solid #334155', padding: '12px', background: '#0f172a' }}>
        <input
          type="text"
          placeholder="Ask a question or request refund..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{
            flex: 1,
            background: '#1e293b',
            border: '1px solid #334155',
            borderRadius: '8px',
            padding: '10px 12px',
            color: '#fff',
            outline: 'none',
            fontSize: '14px'
          }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            marginLeft: '8px',
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '0 16px',
            fontWeight: 600,
            cursor: 'pointer'
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
};

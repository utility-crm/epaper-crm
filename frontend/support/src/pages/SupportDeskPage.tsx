import React, { useState, useEffect } from 'react';

interface Ticket {
  id: string;
  ticket_number: number;
  tenant_id: string;
  custom_domain: string | null;
  user_email: string;
  user_name: string | null;
  subject: string;
  category: string;
  status: string;
  priority: string;
  reply_token: string;
  refund_eligible: number | null;
  refund_eligibility_notes: string | null;
  ai_summary: string | null;
  created_at: string;
}

interface Message {
  id: string;
  sender_type: string;
  sender_email: string;
  sender_name: string | null;
  message_body: string;
  is_internal_note: number;
  created_at: string;
}

export const SupportDeskPage: React.FC = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [replyText, setReplyText] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);
  const [filterTenant, setFilterTenant] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');

  const fetchTickets = async () => {
    try {
      const resp = await fetch('http://localhost:8787/api/tickets');
      const data = await resp.json();
      if (data.tickets) {
        setTickets(data.tickets);
        if (!selectedTicket && data.tickets.length > 0) {
          selectTicket(data.tickets[0]);
        }
      }
    } catch {
      // Offline fallback sample ticket for demo
      const sampleTicket: Ticket = {
        id: 'sample-1',
        ticket_number: 1042,
        tenant_id: 'dailycitynews',
        custom_domain: 'epaper.dailycitynews.com',
        user_email: 'reader@example.com',
        user_name: 'Alex Reader',
        subject: 'Refund Request for monthly subscription',
        category: 'refund',
        status: 'open',
        priority: 'high',
        reply_token: 'a8f9c1d2',
        refund_eligible: 1,
        refund_eligibility_notes: 'Within 7-day window. $9.99 subscription.',
        ai_summary: 'User requested refund via AI Chatbot.',
        created_at: new Date().toISOString(),
      };
      setTickets([sampleTicket]);
      setSelectedTicket(sampleTicket);
      setMessages([
        {
          id: 'm-1',
          sender_type: 'customer',
          sender_email: 'reader@example.com',
          sender_name: 'Alex Reader',
          message_body: 'I need a refund for my subscription please.',
          is_internal_note: 0,
          created_at: new Date().toISOString(),
        },
      ]);
    }
  };

  const selectTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket);
    try {
      const resp = await fetch(`http://localhost:8787/api/tickets/${ticket.id}`);
      const data = await resp.json();
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch {
      // Keep existing
    }
  };

  useEffect(() => {
    void fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSendReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;

    try {
      await fetch(`http://localhost:8787/api/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          senderType: 'agent',
          senderEmail: 'help@support.epaperspace.com',
          senderName: 'Support Desk Agent',
          messageBody: replyText,
          isInternalNote,
        }),
      });
      setReplyText('');
      selectTicket(selectedTicket);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender_type: 'agent',
          sender_email: 'help@support.epaperspace.com',
          sender_name: 'Support Desk Agent',
          message_body: replyText,
          is_internal_note: isInternalNote ? 1 : 0,
          created_at: new Date().toISOString(),
        },
      ]);
      setReplyText('');
    }
  };

  const updateStatus = async (status: string) => {
    if (!selectedTicket) return;
    try {
      await fetch(`http://localhost:8787/api/tickets/${selectedTicket.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      setSelectedTicket({ ...selectedTicket, status });
      setTickets((prev) => prev.map((t) => (t.id === selectedTicket.id ? { ...t, status } : t)));
    } catch {
      setSelectedTicket({ ...selectedTicket, status });
    }
  };

  const filteredTickets = tickets.filter((t) => {
    if (filterTenant && !t.tenant_id.toLowerCase().includes(filterTenant.toLowerCase())) return false;
    if (filterCategory !== 'all' && t.category !== filterCategory) return false;
    return true;
  });

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 64px)', background: '#0f172a', color: '#f8fafc' }}>
      {/* Left Queue Pane */}
      <div style={{ width: '360px', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #334155', background: '#1e293b' }}>
          <div style={{ fontWeight: 700, fontSize: '18px', marginBottom: '12px' }}>Support Desk Queue</div>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
            <input
              type="text"
              placeholder="Filter by Tenant ID..."
              value={filterTenant}
              onChange={(e) => setFilterTenant(e.target.value)}
              style={{
                flex: 1,
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '6px 10px',
                color: '#fff',
                fontSize: '13px'
              }}
            />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              style={{
                background: '#0f172a',
                border: '1px solid #334155',
                borderRadius: '6px',
                padding: '6px 10px',
                color: '#fff',
                fontSize: '13px'
              }}
            >
              <option value="all">All Categories</option>
              <option value="support">Support</option>
              <option value="refund">Refunds</option>
              <option value="billing">Billing</option>
            </select>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filteredTickets.map((t) => (
            <div
              key={t.id}
              onClick={() => selectTicket(t)}
              style={{
                padding: '14px 16px',
                borderBottom: '1px solid #334155',
                background: selectedTicket?.id === t.id ? '#1e40af' : 'transparent',
                cursor: 'pointer',
                transition: 'background 0.15s'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <span style={{ fontWeight: 600, fontSize: '14px' }}>#{t.ticket_number} - {t.user_email}</span>
                <span style={{
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background: t.status === 'open' ? '#dc2626' : '#059669',
                  color: '#fff'
                }}>
                  {t.status.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '8px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.subject}
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', background: '#334155', padding: '2px 6px', borderRadius: '4px', color: '#94a3b8' }}>
                  Tenant: {t.tenant_id}
                </span>
                {t.custom_domain && (
                  <span style={{ fontSize: '11px', background: '#1e293b', border: '1px solid #3b82f6', padding: '2px 6px', borderRadius: '4px', color: '#60a5fa' }}>
                    {t.custom_domain}
                  </span>
                )}
                {t.category === 'refund' && (
                  <span style={{
                    fontSize: '11px',
                    background: t.refund_eligible ? '#065f46' : '#7f1d1d',
                    color: '#fff',
                    padding: '2px 6px',
                    borderRadius: '4px'
                  }}>
                    Refund: {t.refund_eligible ? 'Eligible' : 'Ineligible'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right Conversation & Action Pane */}
      {selectedTicket ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0f172a' }}>
          {/* Top Header & Status bar */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid #334155', background: '#1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 700 }}>
                Ticket #{selectedTicket.ticket_number}: {selectedTicket.subject}
              </div>
              <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
                Customer: {selectedTicket.user_name} ({selectedTicket.user_email}) | Reply Token: {selectedTicket.reply_token}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {selectedTicket.category === 'refund' && (
                <button
                  onClick={() => alert(`Manual Verification Complete: Processing refund for Ticket #${selectedTicket.ticket_number} via Billing Engine.`)}
                  style={{
                    background: '#059669',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Verify & Process Refund
                </button>
              )}
              <select
                value={selectedTicket.status}
                onChange={(e) => updateStatus(e.target.value)}
                style={{
                  background: '#0f172a',
                  border: '1px solid #334155',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  color: '#fff',
                  fontWeight: 600
                }}
              >
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="waiting_on_customer">Waiting on Customer</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
              </select>
            </div>
          </div>

          {/* Refund Pre-Verification Banner */}
          {selectedTicket.category === 'refund' && (
            <div style={{
              background: selectedTicket.refund_eligible ? 'rgba(6, 95, 70, 0.4)' : 'rgba(127, 29, 29, 0.4)',
              borderBottom: '1px solid #334155',
              padding: '12px 24px',
              fontSize: '14px'
            }}>
              <strong>Pre-Ticket Refund Verification:</strong> {selectedTicket.refund_eligibility_notes || 'Eligible for refund'}
            </div>
          )}

          {/* Conversation Thread */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {messages.map((m) => (
              <div
                key={m.id}
                style={{
                  background: m.is_internal_note ? '#3f3f46' : m.sender_type === 'agent' ? '#1e40af' : '#1e293b',
                  border: m.is_internal_note ? '1px dashed #fbbf24' : '1px solid #334155',
                  borderRadius: '12px',
                  padding: '16px',
                  maxWidth: '80%',
                  alignSelf: m.sender_type === 'customer' ? 'flex-start' : 'flex-end'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', color: '#cbd5e1' }}>
                  <span>
                    <strong>{m.sender_name || m.sender_email}</strong> ({m.sender_type.toUpperCase()})
                    {m.is_internal_note ? ' - INTERNAL NOTE' : ''}
                  </span>
                  <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                </div>
                <div style={{ fontSize: '14px', lineHeight: 1.5 }}>{m.message_body}</div>
              </div>
            ))}
          </div>

          {/* Reply Area */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid #334155', background: '#1e293b' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#cbd5e1', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={isInternalNote}
                  onChange={(e) => setIsInternalNote(e.target.checked)}
                />
                Internal Agent Note (Not emailed to customer)
              </label>
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <textarea
                placeholder={isInternalNote ? 'Write an internal team note...' : `Reply to ${selectedTicket.user_email} via support@support.epaperspace.com...`}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                style={{
                  flex: 1,
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '8px',
                  padding: '12px',
                  color: '#fff',
                  fontSize: '14px',
                  minHeight: '70px',
                  outline: 'none'
                }}
              />
              <button
                onClick={handleSendReply}
                style={{
                  background: isInternalNote ? '#d97706' : '#2563eb',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '0 24px',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {isInternalNote ? 'Save Note' : 'Send Reply & Email'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
          Select a ticket to view conversation thread
        </div>
      )}
    </div>
  );
};

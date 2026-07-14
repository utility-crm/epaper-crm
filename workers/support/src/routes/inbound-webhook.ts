import { Hono } from 'hono';
import { SupportEnv, TicketRecord } from '../types.js';

export const inboundWebhookRouter = new Hono<{ Bindings: SupportEnv }>();

inboundWebhookRouter.post('/', async (c) => {
  const body = await c.req.json<{
    from: string;
    to: string;
    subject?: string;
    text?: string;
    html?: string;
  }>();

  if (!body.from || !body.to) {
    return c.json({ success: false, error: 'Missing from or to address' }, 400);
  }

  // Extract reply token from destination address: e.g. ticket-1042-a8f9c1d2@support.epaperspace.com
  // Or extract Ticket #1042 from subject line
  const toUser = body.to.split('@')[0] || '';
  let ticketRecord: TicketRecord | null = null;

  // Pattern: ticket-1042-TOKEN
  const parts = toUser.split('-');
  if (parts.length >= 3 && parts[0] === 'ticket') {
    const token = parts[2];
    ticketRecord = await c.env.SUPPORT_DB.prepare(
      `SELECT * FROM tickets WHERE reply_token = ?`
    ).bind(token).first<TicketRecord>();
  }

  // Fallback: match Subject line e.g. [Ticket #1042]
  if (!ticketRecord && body.subject) {
    const match = body.subject.match(/Ticket\s*#?(\d+)/i);
    if (match && match[1]) {
      const ticketNum = parseInt(match[1], 10);
      ticketRecord = await c.env.SUPPORT_DB.prepare(
        `SELECT * FROM tickets WHERE ticket_number = ?`
      ).bind(ticketNum).first<TicketRecord>();
    }
  }

  const now = new Date().toISOString();

  if (ticketRecord) {
    // Append customer reply message to ticket
    await c.env.SUPPORT_DB.prepare(
      `INSERT INTO ticket_messages (id, ticket_id, sender_type, sender_email, sender_name, message_body, created_at)
       VALUES (?, ?, 'customer', ?, ?, ?, ?)`
    ).bind(
      crypto.randomUUID(),
      ticketRecord.id,
      body.from,
      body.from.split('@')[0],
      body.text || body.html || '(Empty Email Body)',
      now
    ).run();

    // Reopen ticket if previously waiting or resolved
    await c.env.SUPPORT_DB.prepare(
      `UPDATE tickets SET status = 'open', updated_at = ? WHERE id = ?`
    ).bind(now, ticketRecord.id).run();

    return c.json({ success: true, action: 'appended_reply', ticketId: ticketRecord.id });
  }

  // If no matching ticket found, create a new support ticket
  const id = crypto.randomUUID();
  const replyToken = crypto.randomUUID().slice(0, 8);
  const maxRow = await c.env.SUPPORT_DB.prepare(
    `SELECT MAX(ticket_number) as maxNum FROM tickets`
  ).first<{ maxNum: number | null }>();
  const ticketNumber = (maxRow?.maxNum || 1000) + 1;

  await c.env.SUPPORT_DB.prepare(
    `INSERT INTO tickets (id, ticket_number, tenant_id, user_email, user_name, subject, category, status, priority, reply_token, created_at, updated_at)
     VALUES (?, ?, 'epaperspace', ?, ?, ?, 'support', 'open', 'medium', ?, ?, ?)`
  ).bind(
    id,
    ticketNumber,
    body.from,
    body.from.split('@')[0],
    body.subject || 'Inbound Support Email',
    replyToken,
    now,
    now
  ).run();

  await c.env.SUPPORT_DB.prepare(
    `INSERT INTO ticket_messages (id, ticket_id, sender_type, sender_email, sender_name, message_body, created_at)
     VALUES (?, ?, 'customer', ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    id,
    body.from,
    body.from.split('@')[0],
    body.text || body.html || '(Empty Email Body)',
    now
  ).run();

  return c.json({ success: true, action: 'created_ticket', ticketId: id });
});

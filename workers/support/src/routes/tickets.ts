import { Hono } from 'hono';
import { SupportEnv, TicketRecord, TicketMessageRecord } from '../types.js';
import { sendSupportTicketNotification } from '../services/support-mailer.js';
import { getOrgStaff } from '../auth.js';
import { nextTicketNumber } from '../services/ticket-number.js';

export const ticketsRouter = new Hono<{ Bindings: SupportEnv; Variables: { tenantId: string } }>();

// Agent desk is staff-only. Tenant scope comes from the verified JWT, and every
// query below is constrained to it so an agent can only ever see and act on their
// own tenant's tickets — the previous unauthenticated version leaked all tenants.
ticketsRouter.use('/*', async (c, next) => {
  const staff = await getOrgStaff(c, c.env);
  if (!staff) return c.json({ success: false, error: 'Unauthorized' }, 401);
  c.set('tenantId', staff.tenantSlug);
  await next();
});

// Load a ticket only if it belongs to the caller's tenant. Returns null otherwise.
async function getOwnedTicket(c: any, id: string): Promise<TicketRecord | null> {
  return c.env.SUPPORT_DB.prepare(`SELECT * FROM tickets WHERE id = ? AND tenant_id = ?`)
    .bind(id, c.var.tenantId)
    .first<TicketRecord>();
}

// GET /api/tickets?status=...&category=...
ticketsRouter.get('/', async (c) => {
  const status = c.req.query('status');
  const category = c.req.query('category');

  let sql = `SELECT * FROM tickets WHERE tenant_id = ?`;
  const bindings: any[] = [c.var.tenantId];

  if (status && status !== 'all') {
    sql += ` AND status = ?`;
    bindings.push(status);
  }
  if (category && category !== 'all') {
    sql += ` AND category = ?`;
    bindings.push(category);
  }

  sql += ` ORDER BY created_at DESC`;

  const { results } = await c.env.SUPPORT_DB.prepare(sql).bind(...bindings).all<TicketRecord>();
  return c.json({ success: true, tickets: results || [] });
});

// GET /api/tickets/:id
ticketsRouter.get('/:id', async (c) => {
  const ticket = await getOwnedTicket(c, c.req.param('id'));
  if (!ticket) {
    return c.json({ success: false, error: 'Ticket not found' }, 404);
  }

  const { results: messages } = await c.env.SUPPORT_DB.prepare(
    `SELECT * FROM ticket_messages WHERE ticket_id = ? ORDER BY created_at ASC`
  ).bind(ticket.id).all<TicketMessageRecord>();

  return c.json({ success: true, ticket, messages: messages || [] });
});

// POST /api/tickets — manual ticket creation by an agent, in their own tenant.
ticketsRouter.post('/', async (c) => {
  const body = await c.req.json<{
    userEmail: string;
    userName?: string;
    subject: string;
    messageBody: string;
    category?: 'support' | 'refund' | 'billing' | 'bug';
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    customDomain?: string;
  }>();

  const id = crypto.randomUUID();
  const replyToken = crypto.randomUUID().slice(0, 8);
  const now = new Date().toISOString();
  const ticketNumber = await nextTicketNumber(c.env);

  await c.env.SUPPORT_DB.prepare(
    `INSERT INTO tickets (id, ticket_number, tenant_id, custom_domain, user_email, user_name, subject, category, status, priority, reply_token, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`
  ).bind(
    id,
    ticketNumber,
    c.var.tenantId,
    body.customDomain || null,
    body.userEmail,
    body.userName || 'Customer',
    body.subject,
    body.category || 'support',
    body.priority || 'medium',
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
    body.userEmail,
    body.userName || 'Customer',
    body.messageBody,
    now
  ).run();

  return c.json({ success: true, ticketId: id, ticketNumber });
});

// POST /api/tickets/:id/messages
ticketsRouter.post('/:id/messages', async (c) => {
  const ticketId = c.req.param('id');
  const body = await c.req.json<{
    senderType: 'customer' | 'agent' | 'ai_assistant';
    senderEmail: string;
    senderName?: string;
    messageBody: string;
    isInternalNote?: boolean;
  }>();

  const ticket = await getOwnedTicket(c, ticketId);
  if (!ticket) {
    return c.json({ success: false, error: 'Ticket not found' }, 404);
  }

  const now = new Date().toISOString();

  await c.env.SUPPORT_DB.prepare(
    `INSERT INTO ticket_messages (id, ticket_id, sender_type, sender_email, sender_name, message_body, is_internal_note, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    crypto.randomUUID(),
    ticketId,
    body.senderType,
    body.senderEmail,
    body.senderName || null,
    body.messageBody,
    body.isInternalNote ? 1 : 0,
    now
  ).run();

  await c.env.SUPPORT_DB.prepare(
    `UPDATE tickets SET updated_at = ? WHERE id = ?`
  ).bind(now, ticketId).run();

  // Send outbound email if an agent replied and it is not an internal note.
  if (body.senderType === 'agent' && !body.isInternalNote) {
    await sendSupportTicketNotification(c.env, {
      to: ticket.user_email,
      subject: `Re: [Ticket #${ticket.ticket_number}] ${ticket.subject}`,
      html: `<p>${body.messageBody}</p>`,
      ticketNumber: ticket.ticket_number,
      replyToken: ticket.reply_token,
    });
  }

  return c.json({ success: true });
});

// PATCH /api/tickets/:id/status
ticketsRouter.patch('/:id/status', async (c) => {
  const ticketId = c.req.param('id');
  const body = await c.req.json<{ status?: string; priority?: string }>();

  const ticket = await getOwnedTicket(c, ticketId);
  if (!ticket) {
    return c.json({ success: false, error: 'Ticket not found' }, 404);
  }

  const now = new Date().toISOString();

  if (body.status) {
    await c.env.SUPPORT_DB.prepare(
      `UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?`
    ).bind(body.status, now, ticketId).run();
  }
  if (body.priority) {
    await c.env.SUPPORT_DB.prepare(
      `UPDATE tickets SET priority = ?, updated_at = ? WHERE id = ?`
    ).bind(body.priority, now, ticketId).run();
  }

  return c.json({ success: true });
});

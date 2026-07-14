import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { SupportEnv } from './types.js';
import { chatRouter } from './routes/chat.js';
import { memoryRouter } from './routes/memory.js';
import { ticketsRouter } from './routes/tickets.js';
import { inboundWebhookRouter } from './routes/inbound-webhook.js';
import { widgetRouter } from './routes/widget.js';

const app = new Hono<{ Bindings: SupportEnv }>();

// Enable CORS for all tenant custom domains and portals
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Domain'],
}));

// Mount Routes
app.route('/api/chat', chatRouter);
app.route('/api/memory', memoryRouter);
app.route('/api/tickets', ticketsRouter);
app.route('/api/webhooks/inbound-email', inboundWebhookRouter);
app.route('/', widgetRouter);

app.get('/health', (c) => c.json({ status: 'ok', service: 'epaper-support-service' }));

app.get('/', (c) => c.json({
  service: 'epaper-support-service',
  domain: 'support.epaperspace.com',
  status: 'online',
  endpoints: {
    widget: '/widget.js',
    chat: 'POST /api/chat',
    tickets: 'GET|POST /api/tickets',
    memory: 'GET|POST|DELETE /api/memory',
    webhook: 'POST /api/webhooks/inbound-email'
  }
}));

export default app;

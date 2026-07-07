import { Hono } from 'hono';
import { Env } from './middleware';
import { adminAuthRouter } from './admin-auth';
import { orgAuthRouter } from './org-auth';
import { tenantsRouter } from './tenants';
import { auditRouter } from './audit';
import { err, ErrorCode, ok } from '@epaper/types';

const app = new Hono<{ Bindings: Env }>();

app.route('/api/auth', adminAuthRouter);
app.route('/api/auth', orgAuthRouter);
app.route('/api/tenants', tenantsRouter);
app.route('/api/audit', auditRouter);

app.get('/health', (c) => c.json(ok({ status: 'ok', worker: 'admin' })));

app.notFound((c) => {
  return c.json(err(ErrorCode.NOT_FOUND, 'Not found'), 404);
});

export default {
  fetch: app.fetch,
};

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ok, err, ErrorCode } from '@epaper/types';

export interface Env {
  ADMIN_WORKER: Fetcher;
  AUTH_WORKER: Fetcher;
  PROVISION_WORKER: Fetcher;
  CONTENT_WORKER: Fetcher;
  BILLING_PLATFORM_WORKER: Fetcher;
  BILLING_TENANT_WORKER: Fetcher;
  ALLOWED_ORIGIN: string;
}

// Auth-namespace paths that are NOT auth: provisioning-lifecycle endpoints stay on
// the admin worker (they're coupled to PROVISION_WORKER + tenant lifecycle, not sessions).
const ADMIN_OWNED_AUTH_PATHS = [
  '/api/auth/provision-status',
  '/api/auth/reprovision',
  '/api/auth/verify-provisioning',
];

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (c, next) => {
  const allowedOrigins = (c.env.ALLOWED_ORIGIN || '').split(',').map((o) => o.trim());
  const corsMiddleware = cors({
    origin: (origin) => {
      return origin || '*';
    },
    allowHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    allowMethods: ['POST', 'GET', 'OPTIONS', 'PATCH', 'DELETE', 'PUT'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  });
  return corsMiddleware(c, next);
});

app.all('/api/*', async (c) => {
  const path = new URL(c.req.url).pathname;
  let targetWorker: Fetcher | null = null;
  
  const isProvisioningAuthPath = ADMIN_OWNED_AUTH_PATHS.some((p) => path === p || path.startsWith(p + '/'));

  if (path.startsWith('/api/auth') && !isProvisioningAuthPath) {
    // Credential / token / firebase endpoints live on the isolated auth worker.
    targetWorker = c.env.AUTH_WORKER;
  } else if (path.startsWith('/api/auth') || path.startsWith('/api/tenants') || path.startsWith('/api/audit') || path.startsWith('/api/domain') || path.startsWith('/api/tiers') || path.startsWith('/api/admin/billing')) {
    // Remaining /api/auth/* here are the provisioning-lifecycle endpoints (admin-owned).
    targetWorker = c.env.ADMIN_WORKER;
  } else if (path.startsWith('/api/provision')) {
    targetWorker = c.env.PROVISION_WORKER;
  } else if (/^\/api\/read\/[^/]+\/verify-firebase\/?$/.test(path)) {
    // Reader Firebase token-exchange is auth; all other /api/read stays on content.
    targetWorker = c.env.AUTH_WORKER;
  } else if (path.startsWith('/api/content') || path.startsWith('/api/read')) {
    targetWorker = c.env.CONTENT_WORKER;
  } else if (path.startsWith('/api/billing/platform')) {
    targetWorker = c.env.BILLING_PLATFORM_WORKER;
  } else if (path.startsWith('/api/billing/tenant')) {
    targetWorker = c.env.BILLING_TENANT_WORKER;
  }
  
  if (targetWorker) {
    const url = new URL(c.req.url);
    url.hostname = 'internal'; // Hostname is ignored for service bindings, but must be set
    return targetWorker.fetch(new Request(url, c.req.raw));
  }
  
  return c.json(err(ErrorCode.NOT_FOUND, 'Service not found'), 404);
});

app.get('/health', (c) => c.json(ok({ status: 'ok', worker: 'gateway' })));

// Data-only API gateway: it serves JSON, never a frontend. Anything that isn't a
// known /api/* route or /health gets a JSON 404 (no SPA / HTML fallback).
app.get('/', (c) => c.json(ok({ service: 'epaper-gateway', message: 'API gateway. Use /api/*' })));

app.notFound((c) => c.json(err(ErrorCode.NOT_FOUND, 'Not found'), 404));

export default {
  fetch: app.fetch,
};

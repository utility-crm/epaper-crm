import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ok } from '@epaper/types';

export interface Env {
  ADMIN_WORKER: Fetcher;
  PROVISION_WORKER: Fetcher;
  CONTENT_WORKER: Fetcher;
  BILLING_PLATFORM_WORKER: Fetcher;
  BILLING_TENANT_WORKER: Fetcher;
  ALLOWED_ORIGIN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use('/api/*', async (c, next) => {
  const allowedOrigins = (c.env.ALLOWED_ORIGIN || '').split(',').map((o) => o.trim());
  const corsMiddleware = cors({
    origin: (origin, c) => {
      const path = new URL(c.req.url).pathname;
      if (
        path.startsWith('/api/domain/resolve') ||
        path.startsWith('/api/read') ||
        path.startsWith('/api/content')
      ) {
        return origin || '*';
      }
      if (!origin) return allowedOrigins[0] || '*';
      if (
        allowedOrigins.includes(origin) ||
        origin === 'https://epaperspace.com' ||
        origin === 'https://www.epaperspace.com' ||
        origin.endsWith('.epaperspace.com') ||
        origin.endsWith('.pages.dev') ||
        origin.endsWith('.workers.dev') ||
        origin.startsWith('http://localhost:')
      ) {
        return origin;
      }
      return null;
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
  
  if (path.startsWith('/api/auth') || path.startsWith('/api/tenants') || path.startsWith('/api/audit') || path.startsWith('/api/domain') || path.startsWith('/api/tiers') || path.startsWith('/api/admin/billing')) {
    targetWorker = c.env.ADMIN_WORKER;
  } else if (path.startsWith('/api/provision')) {
    targetWorker = c.env.PROVISION_WORKER;
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
  
  return c.text('Service not found', 404);
});

app.get('/health', (c) => c.json(ok({ status: 'ok', worker: 'gateway' })));

export default {
  fetch: app.fetch,
};

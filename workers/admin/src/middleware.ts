import { Context, Next } from 'hono';
import { err, ErrorCode, AdminRole, OrgUserRole } from '@epaper/types';
import { verifyJwt } from './jwt';

export interface Env {
  CONTROL_DB: D1Database;
  ADMIN_JWT_SECRET: string;
  ORG_JWT_SECRET: string;
  PROVISION_WORKER: Fetcher;
  CONTENT_WORKER: Fetcher;
}

export async function adminAuth(c: Context<{ Bindings: Env; Variables: { adminId: string; adminRole: AdminRole } }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Missing or invalid token'), 401);
  }
  const token = authHeader.substring(7);
  const payload = await verifyJwt(token, c.env.ADMIN_JWT_SECRET);
  
  if (!payload || payload.aud !== 'crm' || typeof payload.sub !== 'string' || typeof payload.role !== 'string') {
    return c.json(err(ErrorCode.INVALID_AUDIENCE, 'Invalid admin token'), 403);
  }
  
  c.set('adminId', payload.sub);
  c.set('adminRole', payload.role as AdminRole);
  await next();
}

export async function orgUserAuth(c: Context<{ Bindings: Env; Variables: { tenantId: string; tenantSlug: string; orgRole: OrgUserRole } }>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json(err(ErrorCode.UNAUTHORIZED, 'Missing or invalid token'), 401);
  }
  const token = authHeader.substring(7);
  const payload = await verifyJwt(token, c.env.ORG_JWT_SECRET);
  
  if (!payload || payload.aud !== 'tenant-portal' || typeof payload.sub !== 'string' || typeof payload.tenantSlug !== 'string' || typeof payload.role !== 'string') {
    return c.json(err(ErrorCode.INVALID_AUDIENCE, 'Invalid tenant token'), 403);
  }
  
  c.set('tenantId', payload.sub);
  c.set('tenantSlug', payload.tenantSlug);
  c.set('orgRole', payload.role as OrgUserRole);
  await next();
}

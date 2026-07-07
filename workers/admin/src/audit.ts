import { Hono } from 'hono';
import { Env, adminAuth } from './middleware';
import { ok } from '@epaper/types';

export const auditRouter = new Hono<{ Bindings: Env; Variables: { adminId: string; adminRole: string } }>();

auditRouter.use('/*', adminAuth);

auditRouter.get('/', async (c) => {
  const tenantId = c.req.query('tenant_id');
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = 50;
  const offset = (page - 1) * pageSize;
  
  let query = 'SELECT * FROM audit_log';
  let countQuery = 'SELECT count(*) as total FROM audit_log';
  const params: string[] = [];
  
  if (tenantId) {
    query += ' WHERE tenant_id = ?';
    countQuery += ' WHERE tenant_id = ?';
    params.push(tenantId);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  
  const [itemsRes, countRes] = await c.env.CONTROL_DB.batch([
    c.env.CONTROL_DB.prepare(query).bind(...params, pageSize, offset),
    c.env.CONTROL_DB.prepare(countQuery).bind(...params)
  ]);
  
  const total = (countRes.results[0] as unknown as { total: number })?.total ?? 0;
  
  return c.json(ok({
    items: itemsRes.results,
    total,
    page,
    pageSize
  }));
});

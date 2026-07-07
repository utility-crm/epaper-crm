import { Hono } from 'hono';
import { getTenantDb } from './db';
import { ok, err, ErrorCode } from '@epaper/types';

export const editionsRouter = new Hono<{ Bindings: Record<string, unknown>; Variables: { userId: string } }>();

editionsRouter.get('/:slug/editions', async (c) => {
  const slug = c.req.param('slug');
  const page = parseInt(c.req.query('page') || '1');
  const pageSize = 20;
  const offset = (page - 1) * pageSize;
  
  try {
    const db = getTenantDb(c.env, slug);
    const [itemsRes, countRes] = await db.batch([
      db.prepare('SELECT * FROM editions WHERE status != ? ORDER BY created_at DESC LIMIT ? OFFSET ?').bind('archived', pageSize, offset),
      db.prepare('SELECT count(*) as total FROM editions WHERE status != ?').bind('archived')
    ]);
    
    const total = (countRes.results[0] as unknown as { total: number })?.total ?? 0;
    
    return c.json(ok({
      items: itemsRes.results,
      total,
      page,
      pageSize
    }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

editionsRouter.post('/:slug/editions', async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json();
  
  if (!body.title) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Missing required fields'), 400);
  }
  
  const created_by = c.var.userId;

  try {
    const db = getTenantDb(c.env, slug);
    const id = crypto.randomUUID();

    await db.prepare(
      'INSERT INTO editions (id, title, status, tier_id, created_by) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, body.title, 'draft', body.tier_id ?? null, created_by).run();

    return c.json(ok({ id }), 201);
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

editionsRouter.get('/:slug/editions/:id/epapers', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  
  try {
    const db = getTenantDb(c.env, slug);
    const epapers = await db.prepare('SELECT * FROM epapers WHERE edition_id = ? ORDER BY publish_date DESC').bind(id).all();
    return c.json(ok({ items: epapers.results }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found'), 403);
  }
});

editionsRouter.post('/:slug/editions/:id/epapers', async (c) => {
  const slug = c.req.param('slug');
  const edition_id = c.req.param('id');
  const body = await c.req.json();
  
  if (!body.publish_date) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Missing publish_date'), 400);
  }
  
  try {
    const db = getTenantDb(c.env, slug);
    const id = crypto.randomUUID();

    const freePages = Number.isInteger(body.free_page_count) && body.free_page_count >= 0 ? body.free_page_count : 0;

    await db.prepare(
      'INSERT INTO epapers (id, edition_id, title, publish_date, is_free, free_page_count, publish_type, scheduled_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      id, edition_id, body.title ?? null, body.publish_date, body.is_free ? 1 : 0, freePages,
      body.publish_type || 'instant', body.scheduled_at || null, 'draft'
    ).run();

    return c.json(ok({ id }), 201);
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found'), 403);
  }
});

editionsRouter.get('/:slug/editions/:id', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  
  try {
    const db = getTenantDb(c.env, slug);
    const edition = await db.prepare('SELECT * FROM editions WHERE id = ?').bind(id).first();
    
    if (!edition) return c.json(err(ErrorCode.NOT_FOUND, 'Edition not found'), 404);
    
    return c.json(ok(edition));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

editionsRouter.delete('/:slug/editions/:id', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');

  try {
    const db = getTenantDb(c.env, slug);
    const edition = await db.prepare('SELECT id FROM editions WHERE id = ?').bind(id).first();

    if (!edition) return c.json(err(ErrorCode.NOT_FOUND, 'Edition not found'), 404);

    await db.prepare('UPDATE editions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind('archived', id).run();

    return c.json(ok({ deleted: true }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// Update an edition: tier assignment, title, publish/unpublish.
editionsRouter.patch('/:slug/editions/:id', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  const body = await c.req.json();

  try {
    const db = getTenantDb(c.env, slug);
    const existing = await db.prepare('SELECT * FROM editions WHERE id = ?').bind(id).first<any>();
    if (!existing) return c.json(err(ErrorCode.NOT_FOUND, 'Edition not found'), 404);

    const title = body.title ?? existing.title;
    const tier_id = body.tier_id !== undefined ? body.tier_id : existing.tier_id;
    const status = body.status ?? existing.status;

    await db.prepare('UPDATE editions SET title=?, tier_id=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(title, tier_id, status, id).run();
    return c.json(ok({ updated: true }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

// Update an epaper: title, free_page_count (paywall), publish/unpublish, access.
editionsRouter.patch('/:slug/epapers/:id', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  const body = await c.req.json();

  try {
    const db = getTenantDb(c.env, slug);
    const existing = await db.prepare('SELECT * FROM epapers WHERE id = ?').bind(id).first<any>();
    if (!existing) return c.json(err(ErrorCode.NOT_FOUND, 'Epaper not found'), 404);

    let freePages = body.free_page_count !== undefined ? body.free_page_count : existing.free_page_count;
    if (!Number.isInteger(freePages) || freePages < 0) freePages = 0;
    // Cannot free more pages than exist once the PDF is uploaded.
    if (existing.page_count > 0) freePages = Math.min(freePages, existing.page_count);

    const title = body.title !== undefined ? body.title : existing.title;
    const is_free = body.is_free !== undefined ? (body.is_free ? 1 : 0) : existing.is_free;
    const status = body.status ?? existing.status;

    await db.prepare('UPDATE epapers SET title=?, is_free=?, free_page_count=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
      .bind(title, is_free, freePages, status, id).run();
    return c.json(ok({ updated: true }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB not found or unavailable'), 403);
  }
});

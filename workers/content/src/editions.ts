import { Hono } from 'hono';
import { getTenantDb, getTenantBucket } from './db';
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
    console.error(`Error in editions API (${slug}):`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Database error'), 500);
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
    console.error(`Error in editions API (${slug}):`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Database error'), 500);
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
    console.error(`Error in editions API (${slug}):`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Database error'), 500);
  }
});

editionsRouter.delete('/:slug/epapers/:id', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');

  try {
    const db = getTenantDb(c.env, slug);
    const bucket = getTenantBucket(c.env, slug);
    
    const epaper = await db.prepare('SELECT id, cover_key FROM epapers WHERE id = ?').bind(id).first<{id: string, cover_key: string | null}>();
    if (!epaper) return c.json(err(ErrorCode.NOT_FOUND, 'Epaper not found'), 404);

    const pages = await db.prepare('SELECT r2_key FROM epaper_pages WHERE epaper_id = ?').bind(id).all<{r2_key: string}>();
    
    // Delete files from R2
    const keysToDelete: string[] = (pages.results ?? []).map(p => p.r2_key);
    if (epaper.cover_key) keysToDelete.push(epaper.cover_key);
    
    await Promise.all(keysToDelete.map(k => bucket.delete(k)));

    // Delete DB records
    await db.batch([
      db.prepare('DELETE FROM epaper_pages WHERE epaper_id = ?').bind(id),
      db.prepare('DELETE FROM epapers WHERE id = ?').bind(id)
    ]);

    return c.json(ok({ deleted: true }));
  } catch (e) {
    console.error(`Error in epapers DELETE (${slug}):`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Database error'), 500);
  }
});

editionsRouter.delete('/:slug/editions/:id', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');

  try {
    const db = getTenantDb(c.env, slug);
    const bucket = getTenantBucket(c.env, slug);
    
    const edition = await db.prepare('SELECT id FROM editions WHERE id = ?').bind(id).first();
    if (!edition) return c.json(err(ErrorCode.NOT_FOUND, 'Edition not found'), 404);

    // Fetch all epapers for this edition
    const epapers = await db.prepare('SELECT id, cover_key FROM epapers WHERE edition_id = ?').bind(id).all<{id: string, cover_key: string | null}>();
    
    const keysToDelete: string[] = [];
    const epaperIds = (epapers.results ?? []).map(e => e.id);
    
    if (epaperIds.length > 0) {
      // Collect cover keys
      for (const e of (epapers.results ?? [])) {
        if (e.cover_key) keysToDelete.push(e.cover_key);
      }
      
      // We can't use WHERE IN easily with D1 arrays in bindings unless we build the query
      // but since number of papers per edition is likely small, we can just do individual queries,
      // or build a simple IN clause string
      const placeholders = epaperIds.map(() => '?').join(',');
      const pagesQuery = `SELECT r2_key FROM epaper_pages WHERE epaper_id IN (${placeholders})`;
      
      const pagesRes = await db.prepare(pagesQuery).bind(...epaperIds).all<{r2_key: string}>();
      keysToDelete.push(...(pagesRes.results ?? []).map(p => p.r2_key));
    }

    // Delete all from R2
    if (keysToDelete.length > 0) {
      await Promise.all(keysToDelete.map(k => bucket.delete(k)));
    }

    // Delete DB records
    const batchStmts = [];
    if (epaperIds.length > 0) {
      const placeholders = epaperIds.map(() => '?').join(',');
      batchStmts.push(db.prepare(`DELETE FROM epaper_pages WHERE epaper_id IN (${placeholders})`).bind(...epaperIds));
      batchStmts.push(db.prepare(`DELETE FROM epapers WHERE edition_id = ?`).bind(id));
    }
    batchStmts.push(db.prepare('DELETE FROM editions WHERE id = ?').bind(id));
    
    await db.batch(batchStmts);

    return c.json(ok({ deleted: true }));
  } catch (e) {
    console.error(`Error in editions API (${slug}):`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Database error'), 500);
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
    console.error(`Error in editions API (${slug}):`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Database error'), 500);
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
    console.error(`Error in editions API (${slug}):`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Database error'), 500);
  }
});

// Set default paper for the day
editionsRouter.patch('/:slug/epapers/:id/default', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');
  
  try {
    const db = getTenantDb(c.env, slug);
    const paper = await db.prepare('SELECT publish_date FROM epapers WHERE id = ?').bind(id).first<{ publish_date: string }>();
    if (!paper) return c.json(err(ErrorCode.NOT_FOUND, 'Epaper not found'), 404);

    await db.batch([
      db.prepare('UPDATE epapers SET is_default_for_day = 0 WHERE publish_date = ?').bind(paper.publish_date),
      db.prepare('UPDATE epapers SET is_default_for_day = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(id)
    ]);
    return c.json(ok({ updated: true }));
  } catch (e) {
    console.error(`Error in editions API (${slug}):`, e);
    return c.json(err(ErrorCode.INTERNAL_ERROR, e instanceof Error ? e.message : 'Database error'), 500);
  }
});

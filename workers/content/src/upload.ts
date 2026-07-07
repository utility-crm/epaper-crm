import { Hono } from 'hono';
import { getTenantDb, getTenantBucket } from './db';
import { ok, err, ErrorCode } from '@epaper/types';

export const uploadRouter = new Hono();

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

// ── PUT /:slug/epapers/:id/upload ─────────────────────────────────────────
// Accepts: Content-Type: multipart/form-data
// Receives pre-sliced pages from the client. Each file is one page.
// Supported file types: images (jpeg/png/webp) or sliced single-page PDFs.
// The first file is also stored as the cover thumbnail.
// All previously uploaded pages are deleted before the new upload is stored.
uploadRouter.put('/:slug/epapers/:id/upload', async (c) => {
  const slug = c.req.param('slug');
  const id   = c.req.param('id');
  const ct   = c.req.header('Content-Type') ?? '';

  try {
    const db     = getTenantDb(c.env, slug);
    const bucket = getTenantBucket(c.env, slug);

    const epaper = await db.prepare('SELECT id FROM epapers WHERE id = ?').bind(id).first();
    if (!epaper) return c.json(err(ErrorCode.NOT_FOUND, 'Epaper not found'), 404);

    // Remove previously uploaded pages + cover
    const prev = await db.prepare('SELECT r2_key FROM epaper_pages WHERE epaper_id = ?').bind(id).all<{ r2_key: string }>();
    const oldCover = await db.prepare('SELECT cover_key FROM epapers WHERE id = ?').bind(id).first<{ cover_key: string | null }>();
    const keysToDelete: string[] = (prev.results ?? []).map(p => p.r2_key);
    if (oldCover?.cover_key) keysToDelete.push(oldCover.cover_key);
    await Promise.all(keysToDelete.map(k => bucket.delete(k)));
    await db.prepare('DELETE FROM epaper_pages WHERE epaper_id = ?').bind(id).run();

    if (!ct.startsWith('multipart/form-data')) {
      return c.json(err(ErrorCode.BAD_REQUEST, 'Unsupported content type. Send multipart/form-data with files.'), 415);
    }

    const form = await c.req.formData();
    // Accept any field containing a file (the frontend uses 'pages' or 'images')
    const files: File[] = [];
    for (const [, v] of form.entries()) {
      if (v instanceof File && ACCEPTED_TYPES.has(v.type)) {
        files.push(v);
      }
    }
    if (files.length === 0) return c.json(err(ErrorCode.BAD_REQUEST, 'No valid files provided (pdf/jpeg/png/webp)'), 400);

    // Sort by name so that multi-select uploads preserve order.
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    let totalBytes = 0;
    let coverKey: string | null = null;
    const pageRows: { id: string; page_no: number; r2_key: string }[] = [];

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const ext = f.type === 'application/pdf' ? 'pdf' : f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
      const key = `epapers/${id}/page-${i + 1}.${ext}`;
      const bytes = await f.arrayBuffer();
      const obj = await bucket.put(key, bytes, { httpMetadata: { contentType: f.type } });
      totalBytes += obj?.size ?? bytes.byteLength;
      pageRows.push({ id: crypto.randomUUID(), page_no: i + 1, r2_key: key });
      
      if (i === 0) {
        // First page is the cover — store a separate copy so page 1 can use auth-gating
        // while the cover can be served publicly for thumbnails.
        const coverK = `epapers/${id}/cover.${ext}`;
        await bucket.put(coverK, bytes, { httpMetadata: { contentType: f.type } });
        coverKey = coverK;
      }
    }

    const stmts = pageRows.map(p =>
      db.prepare('INSERT INTO epaper_pages (id, epaper_id, page_no, r2_key) VALUES (?, ?, ?, ?)').bind(p.id, id, p.page_no, p.r2_key)
    );
    stmts.push(
      db.prepare('UPDATE epapers SET page_count=?, free_page_count=MIN(free_page_count,?), r2_key=?, cover_key=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .bind(files.length, files.length, pageRows[0]?.r2_key ?? null, coverKey, id)
    );
    stmts.push(
      db.prepare('UPDATE tenant_stats SET disk_usage_bytes=disk_usage_bytes+?, updated_at=CURRENT_TIMESTAMP WHERE id=1').bind(totalBytes)
    );
    await db.batch(stmts);

    return c.json(ok({ uploaded: true, page_count: files.length, type: files[0].type.includes('pdf') ? 'pdf' : 'images' }));
  } catch (e) {
    console.error('upload error', e);
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB/Bucket not found or unavailable'), 403);
  }
});

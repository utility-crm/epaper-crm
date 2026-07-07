import { Hono } from 'hono';
import { PDFDocument } from 'pdf-lib';
import { getTenantDb, getTenantBucket } from './db';
import { ok, err, ErrorCode } from '@epaper/types';

export const uploadRouter = new Hono();

// Upload a paper's PDF, split it into per-page PDFs, and store each page separately in R2.
// Splitting server-side is what makes the paywall real: locked pages are never bundled into
// a single download — the reader endpoint decides per page whether to serve.
uploadRouter.put('/:slug/epapers/:id/upload', async (c) => {
  const slug = c.req.param('slug');
  const id = c.req.param('id');

  try {
    const db = getTenantDb(c.env, slug);
    const bucket = getTenantBucket(c.env, slug);

    const epaper = await db.prepare('SELECT id FROM epapers WHERE id = ?').bind(id).first();
    if (!epaper) return c.json(err(ErrorCode.NOT_FOUND, 'Epaper not found'), 404);

    const srcBytes = new Uint8Array(await c.req.arrayBuffer());
    if (srcBytes.byteLength === 0) return c.json(err(ErrorCode.BAD_REQUEST, 'Empty upload'), 400);

    let srcDoc: PDFDocument;
    try {
      srcDoc = await PDFDocument.load(srcBytes);
    } catch {
      return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid PDF'), 400);
    }
    const pageCount = srcDoc.getPageCount();
    if (pageCount === 0) return c.json(err(ErrorCode.BAD_REQUEST, 'PDF has no pages'), 400);

    // Remove any previously split pages for this epaper (re-upload replaces).
    const prev = await db.prepare('SELECT r2_key FROM epaper_pages WHERE epaper_id = ?').bind(id).all<{ r2_key: string }>();
    await Promise.all((prev.results ?? []).map(p => bucket.delete(p.r2_key)));
    await db.prepare('DELETE FROM epaper_pages WHERE epaper_id = ?').bind(id).run();

    // Split: one single-page PDF per page.
    let totalBytes = 0;
    const pageRows: { id: string; page_no: number; r2_key: string }[] = [];
    for (let i = 0; i < pageCount; i++) {
      const pageDoc = await PDFDocument.create();
      const [copied] = await pageDoc.copyPages(srcDoc, [i]);
      pageDoc.addPage(copied);
      const pageBytes = await pageDoc.save();
      const key = `epapers/${id}/page-${i + 1}.pdf`;
      const obj = await bucket.put(key, pageBytes, { httpMetadata: { contentType: 'application/pdf' } });
      totalBytes += obj?.size ?? pageBytes.byteLength;
      pageRows.push({ id: crypto.randomUUID(), page_no: i + 1, r2_key: key });
    }

    // Persist page index + page_count; clamp free_page_count to the real page count.
    const stmts = pageRows.map(p =>
      db.prepare('INSERT INTO epaper_pages (id, epaper_id, page_no, r2_key) VALUES (?, ?, ?, ?)').bind(p.id, id, p.page_no, p.r2_key)
    );
    stmts.push(
      db.prepare('UPDATE epapers SET page_count = ?, free_page_count = MIN(free_page_count, ?), r2_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .bind(pageCount, pageCount, `epapers/${id}/page-1.pdf`, id)
    );
    stmts.push(
      db.prepare('UPDATE tenant_stats SET disk_usage_bytes = disk_usage_bytes + ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').bind(totalBytes)
    );
    await db.batch(stmts);

    return c.json(ok({ uploaded: true, page_count: pageCount }));
  } catch (e) {
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB/Bucket not found or unavailable'), 403);
  }
});

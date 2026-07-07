import { Hono } from 'hono';
import { PDFDocument } from 'pdf-lib';
import { getTenantDb, getTenantBucket } from './db';
import { ok, err, ErrorCode } from '@epaper/types';

export const uploadRouter = new Hono();

const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

// ── PUT /:slug/epapers/:id/upload ─────────────────────────────────────────
// Accepts either:
//   Content-Type: application/pdf          → single PDF, split into per-page PDFs
//   Content-Type: multipart/form-data      → multiple image files, each becomes one page
//
// The first page (PDF page 1 or first image) is also stored as the cover thumbnail.
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

    // ── Branch 1: PDF upload ───────────────────────────────────────────────
    if (ct.startsWith('application/pdf')) {
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

      let totalBytes = 0;
      let coverKey: string | null = null;
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
        if (i === 0) coverKey = key; // page 1 doubles as the cover for PDF uploads
      }

      const stmts = pageRows.map(p =>
        db.prepare('INSERT INTO epaper_pages (id, epaper_id, page_no, r2_key) VALUES (?, ?, ?, ?)').bind(p.id, id, p.page_no, p.r2_key)
      );
      stmts.push(
        db.prepare('UPDATE epapers SET page_count=?, free_page_count=MIN(free_page_count,?), r2_key=?, cover_key=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
          .bind(pageCount, pageCount, `epapers/${id}/page-1.pdf`, coverKey, id)
      );
      stmts.push(
        db.prepare('UPDATE tenant_stats SET disk_usage_bytes=disk_usage_bytes+?, updated_at=CURRENT_TIMESTAMP WHERE id=1').bind(totalBytes)
      );
      await db.batch(stmts);

      return c.json(ok({ uploaded: true, page_count: pageCount, type: 'pdf' }));
    }

    // ── Branch 2: Multipart image upload ──────────────────────────────────
    if (ct.startsWith('multipart/form-data')) {
      const form = await c.req.formData();
      // Accept any field named "file" or "files" or "image"; collect all File entries.
      const files: File[] = [];
      for (const [, v] of form.entries()) {
        if (v instanceof File && ACCEPTED_IMAGE_TYPES.has(v.type)) {
          files.push(v);
        }
      }
      if (files.length === 0) return c.json(err(ErrorCode.BAD_REQUEST, 'No valid image files provided (jpeg/png/webp)'), 400);

      // Sort by name so that multi-select uploads preserve order.
      files.sort((a, b) => a.name.localeCompare(b.name));

      let totalBytes = 0;
      let coverKey: string | null = null;
      const pageRows: { id: string; page_no: number; r2_key: string }[] = [];

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
        const key = `epapers/${id}/page-${i + 1}.${ext}`;
        const bytes = await f.arrayBuffer();
        const obj = await bucket.put(key, bytes, { httpMetadata: { contentType: f.type } });
        totalBytes += obj?.size ?? bytes.byteLength;
        pageRows.push({ id: crypto.randomUUID(), page_no: i + 1, r2_key: key });
        if (i === 0) {
          // First image is the cover — store a separate copy so page 1 can use auth-gating
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

      return c.json(ok({ uploaded: true, page_count: files.length, type: 'images' }));
    }

    return c.json(err(ErrorCode.BAD_REQUEST, 'Unsupported content type. Send application/pdf or multipart/form-data with image files.'), 415);
  } catch (e) {
    console.error('upload error', e);
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB/Bucket not found or unavailable'), 403);
  }
});

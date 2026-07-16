import { Hono } from 'hono';
import { getTenantDb, getTenantBucket } from './db';
import { ok, err, ErrorCode } from '@epaper/types';

export const uploadRouter = new Hono();

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
// The per-page protocol only ever receives rendered raster images — the client
// converts PDFs to WebP before upload. Reject PDFs/other types on these fields.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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

    const deletedSizes = await Promise.all(keysToDelete.map(async k => {
      const head = await bucket.head(k);
      await bucket.delete(k);
      return head?.size || 0;
    }));
    const totalDeletedBytes = deletedSizes.reduce((acc, size) => acc + size, 0);
    await db.prepare('DELETE FROM epaper_pages WHERE epaper_id = ?').bind(id).run();

    if (!ct.startsWith('multipart/form-data')) {
      return c.json(err(ErrorCode.BAD_REQUEST, 'Unsupported content type. Send multipart/form-data with files.'), 415);
    }

    const form = await c.req.formData();
    
    // Extract pages and cover separately
    const pageFiles: any[] = [];
    const blurredFiles = new Map<string, any>();
    let coverFile: any | null = null;
    
    for (const [key, v] of form.entries()) {
      const file = v as any;
      if (file.name && file.type && ACCEPTED_TYPES.has(file.type)) {
        if (key === 'cover') {
          coverFile = file;
        } else if (file.name.includes('-blurred')) {
          blurredFiles.set(file.name.replace('-blurred', ''), file);
        } else {
          pageFiles.push(file);
        }
      }
    }
    
    if (pageFiles.length === 0) return c.json(err(ErrorCode.BAD_REQUEST, 'No valid pages provided'), 400);

    // Sort pages by name so that multi-select uploads preserve order.
    pageFiles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    let totalBytes = 0;
    let coverKey: string | null = null;
    const pageRows: { id: string; page_no: number; r2_key: string }[] = [];

    // Handle cover
    if (coverFile) {
      const ext = coverFile.type === 'application/pdf' ? 'pdf' : coverFile.type === 'image/png' ? 'png' : coverFile.type === 'image/webp' ? 'webp' : 'jpg';
      coverKey = `epapers/${id}/cover.${ext}`;
      const bytes = await coverFile.arrayBuffer();
      const obj = await bucket.put(coverKey, bytes, { httpMetadata: { contentType: coverFile.type, cacheControl: 'public, max-age=31536000, immutable' } });
      totalBytes += obj?.size ?? bytes.byteLength;
    }

    for (let i = 0; i < pageFiles.length; i++) {
      const f = pageFiles[i];
      const ext = f.type === 'application/pdf' ? 'pdf' : f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg';
      const pageNumStr = String(i + 1).padStart(3, '0');
      const key = `epapers/${id}/pages/page-${pageNumStr}.${ext}`;
      const bytes = await f.arrayBuffer();
      const obj = await bucket.put(key, bytes, { httpMetadata: { contentType: f.type, cacheControl: 'public, max-age=31536000, immutable' } });
      totalBytes += obj?.size ?? bytes.byteLength;
      pageRows.push({ id: crypto.randomUUID(), page_no: i + 1, r2_key: key });
      
      // Handle corresponding blurred file
      const blurred = blurredFiles.get(f.name);
      if (blurred) {
        const blurredKey = `epapers/${id}/pages/page-${pageNumStr}-blurred.${ext}`;
        const blurredBytes = await blurred.arrayBuffer();
        const blurredObj = await bucket.put(blurredKey, blurredBytes, { httpMetadata: { contentType: blurred.type, cacheControl: 'public, max-age=31536000, immutable' } });
        totalBytes += blurredObj?.size ?? blurredBytes.byteLength;
      }

      if (i === 0 && !coverKey) {
        // Fallback: If no explicit cover was uploaded, use the first page.
        const coverK = `epapers/${id}/cover.${ext}`;
        await bucket.put(coverK, bytes, { httpMetadata: { contentType: f.type, cacheControl: 'public, max-age=31536000, immutable' } });
        coverKey = coverK;
      }
    }

    const stmts = pageRows.map(p =>
      db.prepare('INSERT INTO epaper_pages (id, epaper_id, page_no, r2_key) VALUES (?, ?, ?, ?)').bind(p.id, id, p.page_no, p.r2_key)
    );
    stmts.push(
      db.prepare('UPDATE epapers SET page_count=?, free_page_count=MIN(free_page_count,?), r2_key=?, cover_key=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .bind(pageFiles.length, pageFiles.length, pageRows[0]?.r2_key ?? null, coverKey, id)
    );
    stmts.push(
      db.prepare('UPDATE tenant_stats SET disk_usage_bytes=MAX(0, disk_usage_bytes - ? + ?), updated_at=CURRENT_TIMESTAMP WHERE id=1').bind(totalDeletedBytes, totalBytes)
    );
    await db.batch(stmts);

    return c.json(ok({ uploaded: true, page_count: pageFiles.length, type: pageFiles[0].type.includes('pdf') ? 'pdf' : 'images' }));
  } catch (e) {
    console.error('upload error', e);
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB/Bucket not found or unavailable'), 403);
  }
});

// ── Parallel per-page upload ──────────────────────────────────────────────
// Three-step protocol that lets the client pipeline PDF conversion with
// bounded-concurrency uploads instead of one monolithic multipart PUT:
//   1. POST  /:slug/epapers/:id/upload/begin   — clear prior pages + cover
//   2. PUT   /:slug/epapers/:id/upload/page    — store one page (+ blurred), repeatable/parallel
//   3. POST  /:slug/epapers/:id/upload/commit  — write DB rows + stats in one batch
// Keys are derived server-side from page_no so parallel PUTs never collide and
/**
 * Determines the file extension for an uploaded MIME type.
 *
 * @param type - The uploaded file's MIME type
 * @returns The corresponding file extension, defaulting to `jpg`
 */

function extFor(type: string): string {
  return type === 'application/pdf' ? 'pdf'
    : type === 'image/png' ? 'png'
    : type === 'image/webp' ? 'webp'
    : 'jpg';
}

// Step 1 — clear any previously uploaded pages/cover from R2 + DB.
uploadRouter.post('/:slug/epapers/:id/upload/begin', async (c) => {
  const slug = c.req.param('slug');
  const id   = c.req.param('id');
  try {
    const db     = getTenantDb(c.env, slug);
    const bucket = getTenantBucket(c.env, slug);

    const epaper = await db.prepare('SELECT id FROM epapers WHERE id = ?').bind(id).first();
    if (!epaper) return c.json(err(ErrorCode.NOT_FOUND, 'Epaper not found'), 404);

    const prev = await db.prepare('SELECT r2_key FROM epaper_pages WHERE epaper_id = ?').bind(id).all<{ r2_key: string }>();
    const oldCover = await db.prepare('SELECT cover_key FROM epapers WHERE id = ?').bind(id).first<{ cover_key: string | null }>();
    // Dedupe: cover_key is often the same object as page 1 (no-dedicated-cover case);
    // a Set ensures each unique key is headed/deleted and size-counted exactly once.
    const keysToDelete = new Set<string>();
    for (const p of (prev.results ?? [])) {
      keysToDelete.add(p.r2_key);
      // Blurred variants share the page key with a -blurred suffix; clear them too.
      keysToDelete.add(p.r2_key.replace(/(\.[^.]+)$/, '-blurred$1'));
    }
    if (oldCover?.cover_key) keysToDelete.add(oldCover.cover_key);

    const deletedSizes = await Promise.all([...keysToDelete].map(async k => {
      const head = await bucket.head(k);
      if (head) await bucket.delete(k);
      return head?.size || 0;
    }));
    const totalDeletedBytes = deletedSizes.reduce((acc, size) => acc + size, 0);

    await db.batch([
      db.prepare('DELETE FROM epaper_pages WHERE epaper_id = ?').bind(id),
      // Clear stale page references so the paper never advertises pages whose R2 objects we just
      // deleted. free_page_count is the tenant's configured free-page allocation (set at create/edit),
      // not a page reference — preserve it so replacement uploads keep their paywall setting.
      db.prepare('UPDATE epapers SET page_count=0, r2_key=NULL, cover_key=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(id),
      db.prepare('UPDATE tenant_stats SET disk_usage_bytes=MAX(0, disk_usage_bytes - ?), updated_at=CURRENT_TIMESTAMP WHERE id=1').bind(totalDeletedBytes),
    ]);

    return c.json(ok({ cleared: true }));
  } catch (e) {
    console.error('upload/begin error', e);
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB/Bucket not found or unavailable'), 403);
  }
});

// Step 2 — store one page. multipart/form-data with fields:
//   page_no (text, 1-based), page (file), blurred (file, optional), cover (file, optional)
// Safe to call concurrently for distinct page_no values. Returns the R2 keys +
// authoritative byte sizes so commit can tally disk usage without re-heading.
uploadRouter.put('/:slug/epapers/:id/upload/page', async (c) => {
  const slug = c.req.param('slug');
  const id   = c.req.param('id');
  const ct   = c.req.header('Content-Type') ?? '';
  if (!ct.startsWith('multipart/form-data')) {
    return c.json(err(ErrorCode.BAD_REQUEST, 'Send multipart/form-data'), 415);
  }
  try {
    const db     = getTenantDb(c.env, slug);
    const bucket = getTenantBucket(c.env, slug);

    const epaper = await db.prepare('SELECT id FROM epapers WHERE id = ?').bind(id).first();
    if (!epaper) return c.json(err(ErrorCode.NOT_FOUND, 'Epaper not found'), 404);

    const form = await c.req.formData();

    const pageNo = parseInt(String(form.get('page_no') ?? ''), 10);
    if (!Number.isInteger(pageNo) || pageNo < 1) {
      return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid page_no'), 400);
    }

    const page = form.get('page') as unknown as { name?: string; type?: string; arrayBuffer(): Promise<ArrayBuffer> } | null;
    if (!page || !page.type || !IMAGE_TYPES.has(page.type)) {
      return c.json(err(ErrorCode.BAD_REQUEST, 'Missing or unsupported page file'), 400);
    }

    const pad = String(pageNo).padStart(3, '0');
    const ext = extFor(page.type);
    const put = async (key: string, file: { type?: string; arrayBuffer(): Promise<ArrayBuffer> }) => {
      const bytes = await file.arrayBuffer();
      const obj = await bucket.put(key, bytes, { httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' } });
      return { key, bytes: obj?.size ?? bytes.byteLength };
    };

    const pageRes = await put(`epapers/${id}/pages/page-${pad}.${ext}`, page);
    let bytes = pageRes.bytes;

    const blurred = form.get('blurred') as unknown as { type?: string; arrayBuffer(): Promise<ArrayBuffer> } | null;
    let blurred_key: string | null = null;
    if (blurred && blurred.type && IMAGE_TYPES.has(blurred.type)) {
      const res = await put(`epapers/${id}/pages/page-${pad}-blurred.${ext}`, blurred);
      blurred_key = res.key;
      bytes += res.bytes;
    }

    const cover = form.get('cover') as unknown as { type?: string; arrayBuffer(): Promise<ArrayBuffer> } | null;
    let cover_key: string | null = null;
    if (cover && cover.type && IMAGE_TYPES.has(cover.type)) {
      const res = await put(`epapers/${id}/cover.${extFor(cover.type)}`, cover);
      cover_key = res.key;
      bytes += res.bytes;
    }

    return c.json(ok({ page_no: pageNo, r2_key: pageRes.key, blurred_key, cover_key, bytes }));
  } catch (e) {
    console.error('upload/page error', e);
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB/Bucket not found or unavailable'), 403);
  }
});

// Step 3 — commit the uploaded pages: write rows + stats in one batch.
// body: { page_count } — the number of pages the client uploaded.
// All keys and byte counts are derived and verified server-side from R2, never
// trusted from the request. Page objects live at a fixed prefix per page_no, so
// we probe R2 for each expected page and reject the commit unless a contiguous
// run 1..page_count exists.
const PAGE_EXTS = ['webp', 'jpg', 'png'] as const;

uploadRouter.post('/:slug/epapers/:id/upload/commit', async (c) => {
  const slug = c.req.param('slug');
  const id   = c.req.param('id');
  try {
    const db     = getTenantDb(c.env, slug);
    const bucket = getTenantBucket(c.env, slug);
    const body   = await c.req.json<{ page_count?: number }>();

    const epaper = await db.prepare('SELECT id FROM epapers WHERE id = ?').bind(id).first();
    if (!epaper) return c.json(err(ErrorCode.NOT_FOUND, 'Epaper not found'), 404);

    const pageCount = Number(body.page_count);
    if (!Number.isInteger(pageCount) || pageCount < 1) {
      return c.json(err(ErrorCode.BAD_REQUEST, 'Invalid page_count'), 400);
    }

    // Resolve one uploaded page object by probing the known extensions at its
    // server-owned prefix. Returns the verified key + size, or null if absent.
    const resolveObject = async (base: string) => {
      for (const ext of PAGE_EXTS) {
        const key = `${base}.${ext}`;
        const head = await bucket.head(key);
        if (head) return { key, bytes: head.size };
      }
      return null;
    };

    const prefix = `epapers/${id}`;
    const pageRows: { page_no: number; r2_key: string }[] = [];
    let totalBytes = 0;

    for (let n = 1; n <= pageCount; n++) {
      const pad = String(n).padStart(3, '0');
      const pageObj = await resolveObject(`${prefix}/pages/page-${pad}`);
      if (!pageObj) {
        return c.json(err(ErrorCode.BAD_REQUEST, `Missing uploaded object for page ${n}`), 400);
      }
      pageRows.push({ page_no: n, r2_key: pageObj.key });
      totalBytes += pageObj.bytes;

      // Blurred variant is optional; count it only when present.
      const blurred = await resolveObject(`${prefix}/pages/page-${pad}-blurred`);
      if (blurred) totalBytes += blurred.bytes;
    }

    // Cover is server-owned too; verify and size it, else fall back to page 1.
    const coverObj = await resolveObject(`${prefix}/cover`);
    let coverKey = pageRows[0].r2_key;
    if (coverObj) {
      coverKey = coverObj.key;
      totalBytes += coverObj.bytes;
    }

    const stmts = pageRows.map(p =>
      db.prepare('INSERT INTO epaper_pages (id, epaper_id, page_no, r2_key) VALUES (?, ?, ?, ?)').bind(crypto.randomUUID(), id, p.page_no, p.r2_key)
    );
    stmts.push(
      db.prepare('UPDATE epapers SET page_count=?, free_page_count=MIN(free_page_count,?), r2_key=?, cover_key=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .bind(pageRows.length, pageRows.length, pageRows[0].r2_key, coverKey, id)
    );
    stmts.push(
      db.prepare('UPDATE tenant_stats SET disk_usage_bytes=disk_usage_bytes + ?, updated_at=CURRENT_TIMESTAMP WHERE id=1').bind(totalBytes)
    );
    await db.batch(stmts);

    return c.json(ok({ committed: true, page_count: pageRows.length }));
  } catch (e) {
    console.error('upload/commit error', e);
    return c.json(err(ErrorCode.SLUG_NOT_FOUND, 'Tenant DB/Bucket not found or unavailable'), 403);
  }
});

import { openPdf } from './pdfToImages';
import { portalApi } from './api';

// Max concurrent page uploads in flight. PDF page conversion is CPU-bound on the
// main thread and stays serial; this pipelines those conversions with uploads so
// pages ship the moment they're ready instead of after the whole document.
const MAX_CONCURRENT_UPLOADS = 4;

export interface UploadArgs {
  slug: string;
  epaperId: string;
  token: string;
  files: File[];
  cover?: File | null;
  isPdf: boolean;
  onProgress?: (msg: string) => void;
}

export interface UploadOutcome {
  ok: boolean;
  error?: string;
  pageCount?: number;
}

interface CommittedPage {
  page_no: number;
  r2_key: string;
}

// Runs begin → per-page upload (parallel) → commit. A single rejected page upload
// aborts the whole run so we never commit a partial paper.
export async function uploadEpaperContent(args: UploadArgs): Promise<UploadOutcome> {
  const { slug, epaperId, token, files, cover, isPdf, onProgress } = args;
  if (files.length === 0) return { ok: false, error: 'No files to upload' };

  const begin = await portalApi.uploadBegin(slug, epaperId, token);
  if (!begin.ok) return { ok: false, error: begin.error?.message ?? 'Failed to prepare upload' };

  const committed: CommittedPage[] = [];
  let coverKey: string | null = null;
  let totalBytes = 0;
  let done = 0;

  // A user-supplied cover overrides the auto-generated one; attach it to page 1.
  const explicitCover = cover ?? null;

  try {
    if (isPdf) {
      const pdf = await openPdf(files[0]);
      const numPages = pdf.numPages;
      try {
        const inFlight = new Set<Promise<void>>();

        const dispatch = (pageNo: number, page: File, blurred: File | null, coverForPage: File | null) => {
          const task = (async () => {
            const res = await portalApi.uploadPage(slug, epaperId, pageNo, page, token, { blurred, cover: coverForPage });
            if (!res.ok || !res.data) throw new Error(res.error?.message ?? `Failed to upload page ${pageNo}`);
            committed.push({ page_no: res.data.page_no, r2_key: res.data.r2_key });
            if (res.data.cover_key) coverKey = res.data.cover_key;
            totalBytes += res.data.bytes ?? 0;
            done++;
            onProgress?.(`Uploaded ${done} of ${numPages} pages…`);
          })();
          inFlight.add(task);
          task.finally(() => inFlight.delete(task));
        };

        for (let i = 1; i <= numPages; i++) {
          onProgress?.(`Converting page ${i} of ${numPages}…`);
          const { page, blurred, cover: genCover } = await pdf.convertPage(i);
          const coverForPage = i === 1 ? (explicitCover ?? genCover) : null;
          dispatch(i, page, blurred, coverForPage);

          if (inFlight.size >= MAX_CONCURRENT_UPLOADS) {
            await Promise.race(inFlight);
          }
        }
        await Promise.all(inFlight);
      } finally {
        await pdf.destroy();
      }
    } else {
      // Pre-sliced images: one file per page, ordered by filename like the legacy path.
      const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      let next = 0;
      const worker = async () => {
        while (next < ordered.length) {
          const idx = next++;
          const pageNo = idx + 1;
          const coverForPage = pageNo === 1 ? explicitCover : null;
          const res = await portalApi.uploadPage(slug, epaperId, pageNo, ordered[idx], token, { cover: coverForPage });
          if (!res.ok || !res.data) throw new Error(res.error?.message ?? `Failed to upload page ${pageNo}`);
          committed.push({ page_no: res.data.page_no, r2_key: res.data.r2_key });
          if (res.data.cover_key) coverKey = res.data.cover_key;
          totalBytes += res.data.bytes ?? 0;
          done++;
          onProgress?.(`Uploaded ${done} of ${ordered.length} pages…`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, ordered.length) }, worker));
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Upload failed' };
  }

  committed.sort((a, b) => a.page_no - b.page_no);
  onProgress?.('Finalizing…');
  const commit = await portalApi.uploadCommit(
    slug,
    epaperId,
    { pages: committed, cover_key: coverKey, total_bytes: totalBytes },
    token
  );
  if (!commit.ok) return { ok: false, error: commit.error?.message ?? 'Failed to finalize upload' };

  return { ok: true, pageCount: committed.length };
}

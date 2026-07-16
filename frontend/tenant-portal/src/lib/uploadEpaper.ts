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

// Runs begin → per-page upload (parallel) → commit. A single rejected page upload
// aborts the whole run so we never commit a partial paper. The commit derives all
// keys and byte counts server-side from R2, so the client only reports how many
// pages it uploaded (page_no 1..pageCount).
/**
 * Uploads e-paper content and finalizes the upload only after every page succeeds.
 *
 * @param args - Upload identifiers, source files, format, optional cover, and progress callback.
 * @returns The upload status, including an error message on failure or the number of committed pages on success.
 */
export async function uploadEpaperContent(args: UploadArgs): Promise<UploadOutcome> {
  const { slug, epaperId, token, files, cover, isPdf, onProgress } = args;
  if (files.length === 0) return { ok: false, error: 'No files to upload' };

  const begin = await portalApi.uploadBegin(slug, epaperId, token);
  if (!begin.ok) return { ok: false, error: begin.error?.message ?? 'Failed to prepare upload' };

  let done = 0;
  let pageCount = 0;

  // A user-supplied cover overrides the auto-generated one; attach it to page 1.
  const explicitCover = cover ?? null;

  try {
    if (isPdf) {
      const pdf = await openPdf(files[0]);
      const numPages = pdf.numPages;
      pageCount = numPages;
      try {
        const inFlight = new Set<Promise<void>>();
        const dispatched: Promise<void>[] = [];

        const dispatch = (pageNo: number, page: File, blurred: File | null, coverForPage: File | null) => {
          const task = (async () => {
            const res = await portalApi.uploadPage(slug, epaperId, pageNo, page, token, { blurred, cover: coverForPage });
            if (!res.ok || !res.data) throw new Error(res.error?.message ?? `Failed to upload page ${pageNo}`);
            done++;
            onProgress?.(`Uploaded ${done} of ${numPages} pages…`);
          })();
          dispatched.push(task);
          inFlight.add(task);
          // Free the concurrency slot once settled, but keep the rejection observable:
          // Promise.all(dispatched) below still holds `task`, so a failed page aborts the run.
          // (settle handler returns void and never rethrows, so it adds no unhandled rejection.)
          task.then(() => inFlight.delete(task), () => inFlight.delete(task));
        };

        for (let i = 1; i <= numPages; i++) {
          onProgress?.(`Converting page ${i} of ${numPages}…`);
          const { page, blurred, cover: genCover } = await pdf.convertPage(i);
          const coverForPage = i === 1 ? (explicitCover ?? genCover) : null;
          dispatch(i, page, blurred, coverForPage);

          if (inFlight.size >= MAX_CONCURRENT_UPLOADS) {
            // Only waiting for a slot to free up here; the real error propagation
            // happens at Promise.all(dispatched), which observes every task.
            await Promise.race(inFlight).catch(() => {});
          }
        }
        await Promise.all(dispatched);
      } finally {
        await pdf.destroy();
      }
    } else {
      // Pre-sliced images: one file per page, ordered by filename like the legacy path.
      const ordered = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      pageCount = ordered.length;
      let next = 0;
      const worker = async () => {
        while (next < ordered.length) {
          const idx = next++;
          const pageNo = idx + 1;
          const coverForPage = pageNo === 1 ? explicitCover : null;
          const res = await portalApi.uploadPage(slug, epaperId, pageNo, ordered[idx], token, { cover: coverForPage });
          if (!res.ok || !res.data) throw new Error(res.error?.message ?? `Failed to upload page ${pageNo}`);
          done++;
          onProgress?.(`Uploaded ${done} of ${ordered.length} pages…`);
        }
      };
      await Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_UPLOADS, ordered.length) }, worker));
    }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Upload failed' };
  }

  onProgress?.('Finalizing…');
  const commit = await portalApi.uploadCommit(slug, epaperId, { page_count: pageCount }, token);
  if (!commit.ok) return { ok: false, error: commit.error?.message ?? 'Failed to finalize upload' };

  return { ok: true, pageCount };
}

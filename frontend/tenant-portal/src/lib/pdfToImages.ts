import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`;

export interface PdfPageResult {
  pageNo: number;      // 1-based
  page: File;          // full-resolution WebP
  blurred: File | null; // blurred paywall variant
  cover: File | null;   // only set for page 1
}

export interface PdfHandle {
  numPages: number;
  convertPage(pageNo: number): Promise<PdfPageResult>;
  destroy(): Promise<void>;
}

// Open a PDF once and convert its pages on demand. Lets callers pipeline
// conversion with uploads and convert pages concurrently instead of waiting
/**
 * Opens a PDF and provides on-demand page conversion and resource cleanup.
 *
 * @param pdfFile - The PDF file to open
 * @returns A handle with the page count and operations for converting pages and releasing resources
 * @throws Error if the PDF contains no pages
 */
export async function openPdf(pdfFile: File): Promise<PdfHandle> {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const numPages = pdf.numPages;
  if (numPages === 0) {
    await loadingTask.destroy();
    throw new Error('PDF has no pages');
  }

  return {
    numPages,
    convertPage: (pageNo: number) => convertOne(pdf, pageNo),
    destroy: () => loadingTask.destroy(),
  };
}

/**
 * Converts a PDF page into full-resolution WebP output with optional blurred and cover variants.
 *
 * @param i - The 1-based page number to convert
 * @returns The page file, an optional blurred variant, and a cover thumbnail for page 1
 * @throws If the main canvas context is unavailable or WebP encoding fails
 */
async function convertOne(pdf: pdfjsLib.PDFDocumentProxy, i: number): Promise<PdfPageResult> {
  const page = await pdf.getPage(i);
  const baseViewport = page.getViewport({ scale: 1.0 });

  // Target around 2000px width for sharp text while keeping WebP file size small (~300KB)
  const scale = Math.max(1.5, 2000 / baseViewport.width);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas 2d context not available');
  }

  await page.render({
    canvasContext: context,
    viewport: viewport,
    canvas: canvas,
  }).promise;

  const webpBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error(`Failed to convert page ${i} to WebP`))),
      'image/webp',
      0.88
    );
  });

  const pageNumStr = String(i).padStart(3, '0');
  const pageFile = new File([webpBlob], `page-${pageNumStr}.webp`, { type: 'image/webp' });

  // Generate blurred thumbnail for premium paywall
  let blurredFile: File | null = null;
  const blurScale = Math.min(1.0, 800 / baseViewport.width); // downscale for smaller size
  const blurCanvas = document.createElement('canvas');
  blurCanvas.width = baseViewport.width * blurScale;
  blurCanvas.height = baseViewport.height * blurScale;
  const blurCtx = blurCanvas.getContext('2d');
  if (blurCtx) {
    // Draw heavily blurred original
    blurCtx.filter = 'blur(15px)';
    blurCtx.drawImage(canvas, 0, 0, blurCanvas.width, blurCanvas.height);

    // Bake PREMIUM overlay into it
    blurCtx.filter = 'none';
    blurCtx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    blurCtx.fillRect(0, 0, blurCanvas.width, blurCanvas.height);

    blurCtx.font = 'bold 40px sans-serif';
    blurCtx.fillStyle = 'white';
    blurCtx.textAlign = 'center';
    blurCtx.textBaseline = 'middle';
    blurCtx.fillText('PREMIUM', blurCanvas.width / 2, blurCanvas.height / 2 - 20);
    blurCtx.font = '24px sans-serif';
    blurCtx.fillText('Content Locked', blurCanvas.width / 2, blurCanvas.height / 2 + 25);

    const blurredBlob = await new Promise<Blob>((resolve, reject) => {
      blurCanvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Failed to generate blurred page'))),
        'image/webp',
        0.3 // highly compressed since it's blurred anyway
      );
    });
    blurredFile = new File([blurredBlob], `page-${pageNumStr}-blurred.webp`, { type: 'image/webp' });
  }

  // Generate a smaller cover thumbnail for listings (~600px wide) from page 1
  let coverFile: File | null = null;
  if (i === 1) {
    const coverScale = Math.min(1.0, 600 / baseViewport.width);
    const coverViewport = page.getViewport({ scale: coverScale });
    const coverCanvas = document.createElement('canvas');
    coverCanvas.width = coverViewport.width;
    coverCanvas.height = coverViewport.height;
    const coverCtx = coverCanvas.getContext('2d');
    if (coverCtx) {
      await page.render({
        canvasContext: coverCtx,
        viewport: coverViewport,
        canvas: coverCanvas,
      }).promise;
      const coverBlob = await new Promise<Blob>((resolve) => {
        coverCanvas.toBlob((b) => resolve(b || webpBlob), 'image/webp', 0.85);
      });
      coverFile = new File([coverBlob], 'cover.webp', { type: 'image/webp' });
    }
  }

  // Free canvas memory
  canvas.width = 0;
  canvas.height = 0;

  return { pageNo: i, page: pageFile, blurred: blurredFile, cover: coverFile };
}

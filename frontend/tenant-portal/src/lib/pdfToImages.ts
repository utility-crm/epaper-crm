import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`;

export async function convertPdfToWebpPages(
  pdfFile: File,
  onProgress?: (msg: string) => void
): Promise<{ pages: File[]; cover: File }> {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const numPages = pdf.numPages;
  if (numPages === 0) {
    throw new Error('PDF has no pages');
  }

  const pages: File[] = [];
  let coverFile: File | null = null;

  for (let i = 1; i <= numPages; i++) {
    onProgress?.(`Converting page ${i} of ${numPages} to WebP...`);
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
    const pageFile = new File([webpBlob], `page-${pageNumStr}.webp`, {
      type: 'image/webp',
    });
    pages.push(pageFile);

    if (i === 1) {
      // Also generate a smaller cover thumbnail for listings (~600px wide)
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
  }

  return {
    pages,
    cover: coverFile || pages[0],
  };
}

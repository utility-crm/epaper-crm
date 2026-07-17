import './promiseWithResolvers';
import * as pdfjsLib from 'pdfjs-dist';

// Use Cloudflare CDN for the worker to avoid Vite bundling issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`;

export async function extractPdfThumbnail(pdfFile: File): Promise<File> {
  const arrayBuffer = await pdfFile.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  if (pdf.numPages === 0) {
    throw new Error('PDF has no pages');
  }

  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1.0 });
  
  // Scale down to a reasonable thumbnail size (max width 600px)
  const scale = Math.min(1.0, 600 / viewport.width);
  const scaledViewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  if (!context) {
    throw new Error('Canvas 2d context not available');
  }

  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;

  await page.render({
    canvasContext: context,
    viewport: scaledViewport,
    canvas: canvas
  }).promise;

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(new File([blob], 'cover.jpg', { type: 'image/jpeg' }));
      } else {
        reject(new Error('Failed to create blob from canvas'));
      }
    }, 'image/jpeg', 0.85);
  });
}

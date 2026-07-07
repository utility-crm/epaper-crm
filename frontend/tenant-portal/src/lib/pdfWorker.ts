import { PDFDocument } from 'pdf-lib';

self.onmessage = async (e: MessageEvent) => {
  const { fileData } = e.data;
  
  try {
    const srcDoc = await PDFDocument.load(fileData);
    const pageCount = srcDoc.getPageCount();
    
    self.postMessage({ type: 'progress', message: 'PDF loaded', pageCount });
    
    const pages: Uint8Array[] = [];
    for (let i = 0; i < pageCount; i++) {
      const pageDoc = await PDFDocument.create();
      const [copied] = await pageDoc.copyPages(srcDoc, [i]);
      pageDoc.addPage(copied);
      const bytes = await pageDoc.save();
      pages.push(bytes);
      
      // Update progress every 5 pages or on the last page
      if (i % 5 === 0 || i === pageCount - 1) {
         self.postMessage({ type: 'progress', message: `Extracted page ${i + 1} of ${pageCount}` });
      }
    }
    
    self.postMessage({ type: 'done', pages });
  } catch (error) {
    self.postMessage({ type: 'error', error: error instanceof Error ? error.message : 'Unknown error during PDF processing' });
  }
};

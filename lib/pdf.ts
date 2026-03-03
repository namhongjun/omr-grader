/**
 * PDF → 이미지 변환 (Node.js)
 */
async function getPdfLib() {
  const mod = await import("pdfjs-dist");
  return mod.getDocument;
}

async function getCanvas() {
  const canvas = await import("canvas");
  return canvas.createCanvas;
}

export async function pdfToImages(pdfBuffer: Buffer): Promise<Buffer[]> {
  const getDocument = await getPdfLib();
  const createCanvas = await getCanvas();
  const loadingTask = getDocument({ data: new Uint8Array(pdfBuffer) });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const images: Buffer[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 });
    const canv = createCanvas(viewport.width, viewport.height);
    const ctx = canv.getContext("2d");
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    const buf = canv.toBuffer("image/jpeg", { quality: 0.9 });
    images.push(buf);
  }
  return images;
}

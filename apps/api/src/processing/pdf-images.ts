import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pdf } from 'pdf-to-img';
import sharp from 'sharp';

// pdf.js needs its bundled fonts (non-embedded standard fonts) and wasm decoders (JBIG2 / JPEG 2000 images,
// e.g. scanned photos; without them those images render blank).
// On Windows it only accepts plain paths with forward slashes (not file:// URLs, not backslashes).
const PDFJS_DIR = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
const forward = (p: string) => p.split('\\').join('/');
const STANDARD_FONTS = forward(join(PDFJS_DIR, 'standard_fonts/'));
const WASM_DIR = forward(join(PDFJS_DIR, 'wasm/'));
/** Options every pdf.js document in this app is opened with. */
const DOC_OPTIONS = { standardFontDataUrl: STANDARD_FONTS, wasmUrl: WASM_DIR };

/** Render every page of a PDF to PNG. Scale 2 keeps small exam text and equations readable for the AI. */
export async function renderPdfPages(pdfBuffer: Buffer, onPage?: (pageNumber: number, total: number) => Promise<void> | void): Promise<Buffer[]> {
  const doc = await pdf(pdfBuffer, { scale: 2, docInitParams: DOC_OPTIONS });
  const pages: Buffer[] = [];
  try {
    for await (const page of doc) {
      pages.push(page);
      await onPage?.(pages.length, doc.length);
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}

/**
 * Text of each page (from the PDF's text layer). Used to skip pages that only say "BLANK PAGE",
 * so they don't cost an AI call. Scanned PDFs have no text layer: they return "" and are never skipped.
 */
export async function pageTexts(pdfBuffer: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(pdfBuffer), verbosity: 0, ...DOC_OPTIONS }).promise;
  try {
    const texts: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      texts.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
    }
    return texts;
  } finally {
    await doc.cleanup();
    await doc.loadingTask.destroy();
  }
}

/** A page that only contains "BLANK PAGE" (plus page furniture like a barcode / page number). */
export function isBlankPage(text: string): boolean {
  return /\bBLANK\s+PAGE\b/i.test(text) && text.length < 120;
}

/** Render only page 1 (the cover) - used to detect paper details before upload. */
export async function renderFirstPage(pdfBuffer: Buffer): Promise<Buffer> {
  const doc = await pdf(pdfBuffer, { scale: 2, docInitParams: DOC_OPTIONS });
  try {
    return await doc.getPage(1);
  } finally {
    await doc.destroy();
  }
}

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Clamp an AI-provided box to the page and make sure x0<x1, y0<y1. Returns null for unusable boxes. */
export function normaliseBox(box: Box): Box | null {
  const clamp = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
  const x0 = clamp(Math.min(box.x0, box.x1));
  const x1 = clamp(Math.max(box.x0, box.x1));
  const y0 = clamp(Math.min(box.y0, box.y1));
  const y1 = clamp(Math.max(box.y0, box.y1));
  if (x1 - x0 < 0.02 || y1 - y0 < 0.02) return null;
  return { x0, y0, x1, y1 };
}

/** Crop a normalised box (plus a little padding) out of a page image and encode as WebP. */
export async function cropToWebp(pageImage: Buffer, box: Box, padding = 0.01): Promise<Buffer> {
  const image = sharp(pageImage);
  const { width = 0, height = 0 } = await image.metadata();
  const left = Math.max(0, Math.floor((box.x0 - padding) * width));
  const top = Math.max(0, Math.floor((box.y0 - padding) * height));
  const right = Math.min(width, Math.ceil((box.x1 + padding) * width));
  const bottom = Math.min(height, Math.ceil((box.y1 + padding) * height));
  return image
    .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
    .webp({ quality: 85 })
    .toBuffer();
}

/** Print quality: ~250 DPI (A4 is 595 x 842 pt, so scale 3.5 ≈ 2083 x 2947 px). */
export const PRINT_SCALE = 3.5;

/** Render only the given pages (1-based) of a PDF at print quality, for worksheet crops. */
export async function renderPdfPagesAt(pdfBuffer: Buffer, pageNumbers: number[], scale = PRINT_SCALE): Promise<Map<number, Buffer>> {
  const doc = await pdf(pdfBuffer, { scale, docInitParams: DOC_OPTIONS });
  const out = new Map<number, Buffer>();
  try {
    for (const n of [...new Set(pageNumbers)].sort((a, b) => a - b)) if (n >= 1 && n <= doc.length) out.set(n, await doc.getPage(n));
  } finally {
    await doc.destroy();
  }
  return out;
}

/**
 * Crop a whole question part for printing: the exact box (no padding, so spacing stays as on the paper).
 * Greyscale JPEG: Chrome puts JPEGs into a PDF as they are (WebP gets re-encoded several times larger).
 */
export async function cropForPrint(pageImage: Buffer, box: Box): Promise<Buffer> {
  const image = sharp(pageImage);
  const { width = 0, height = 0 } = await image.metadata();
  const left = Math.max(0, Math.floor(box.x0 * width));
  const top = Math.max(0, Math.floor(box.y0 * height));
  const right = Math.min(width, Math.ceil(box.x1 * width));
  const bottom = Math.min(height, Math.ceil(box.y1 * height));
  return image
    .extract({ left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) })
    .greyscale()
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();
}

import type { Bbox } from "@/lib/db/schema";

/** One pdfjs text item, positioned in the concatenated document text. Coordinates are PDF user space (origin bottom-left). */
export type TextSpan = { start: number; end: number; page: number; x: number; y: number; w: number; h: number };

export type PdfPage = { page: number; width: number; height: number };

export type PdfExtraction = {
  text: string;
  pages: PdfPage[];
  spans: TextSpan[];
  /** Characters of text per page; a near-zero value suggests a scanned PDF. */
  charsPerPage: number;
};

export async function extractPdf(data: Uint8Array): Promise<PdfExtraction> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(data), // pdfjs transfers/detaches the buffer
    useSystemFonts: true,
  }).promise;

  let text = "";
  const spans: TextSpan[] = [];
  const pages: PdfPage[] = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ page: p, width: viewport.width, height: viewport.height });
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item)) continue;
      if (item.str.length > 0) {
        const start = text.length;
        text += item.str;
        const [, , , , e, f] = item.transform as number[];
        spans.push({ start, end: text.length, page: p, x: e, y: f, w: item.width, h: item.height });
      }
      if (item.hasEOL) text += "\n";
    }
    if (!text.endsWith("\n")) text += "\n";
    text += "\n"; // blank line between pages
  }
  await doc.cleanup();

  const chars = text.replace(/\s/g, "").length;
  return { text, pages, spans, charsPerPage: pages.length ? chars / pages.length : 0 };
}

/** Union of all spans overlapping [start, end), one box per page. */
export function bboxesForRange(spans: TextSpan[], start: number, end: number): Bbox[] {
  const byPage = new Map<number, { x0: number; y0: number; x1: number; y1: number }>();
  for (const s of spans) {
    if (s.end <= start || s.start >= end) continue;
    const b = byPage.get(s.page);
    const x1 = s.x + s.w;
    const y1 = s.y + s.h;
    if (!b) byPage.set(s.page, { x0: s.x, y0: s.y, x1, y1 });
    else {
      b.x0 = Math.min(b.x0, s.x);
      b.y0 = Math.min(b.y0, s.y);
      b.x1 = Math.max(b.x1, x1);
      b.y1 = Math.max(b.y1, y1);
    }
  }
  return [...byPage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, b]) => ({ page, x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 }));
}

export function pageAt(spans: TextSpan[], offset: number): number | null {
  for (const s of spans) if (s.end > offset) return s.page;
  return null;
}

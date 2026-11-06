import { createHash } from "node:crypto";
import type { Bbox } from "@/lib/db/schema";
import { extractDocx } from "./docx";
import { bboxesForRange, extractPdf, pageAt } from "./pdf";
import { segment } from "./segment";

export type IngestedClause = {
  clauseRef: string | null;
  sectionPath: string[];
  heading: string | null;
  text: string;
  pageNumber: number | null;
  charStart: number;
  charEnd: number;
  bboxJson: Bbox[] | null;
  textHash: string;
};

export type IngestResult = { pageCount: number | null; text: string; clauses: IngestedClause[] };

export class ScannedPdfError extends Error {
  constructor() {
    super("No extractable text found: text PDF required (scanned PDFs are not supported).");
  }
}

const hash = (s: string) => createHash("sha256").update(s.replace(/\s+/g, " ").trim()).digest("hex");

export async function ingestBuffer(data: Uint8Array, filename: string): Promise<IngestResult> {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf")) {
    const pdf = await extractPdf(data);
    if (pdf.charsPerPage < 50) throw new ScannedPdfError();
    const clauses = segment(pdf.text).map((s) => ({
      ...s,
      pageNumber: pageAt(pdf.spans, s.charStart),
      bboxJson: bboxesForRange(pdf.spans, s.charStart, s.charEnd),
      textHash: hash(s.text),
    }));
    return { pageCount: pdf.pages.length, text: pdf.text, clauses };
  }
  if (lower.endsWith(".docx")) {
    const { text } = await extractDocx(data);
    const clauses = segment(text).map((s) => ({
      ...s, pageNumber: null, bboxJson: null, textHash: hash(s.text),
    }));
    return { pageCount: null, text, clauses };
  }
  throw new Error("Unsupported file type: expected .pdf or .docx");
}

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ingestBuffer, ScannedPdfError } from "@/lib/ingest";
import { bboxesForRange } from "@/lib/ingest/pdf";
import { segment } from "@/lib/ingest/segment";

const read = (p: string) => fs.readFileSync(path.join(__dirname, "../data/contracts", p));

describe("segment: nested numbering fixture", () => {
  const text = read("fixtures/nested-numbering.txt").toString();
  const segs = segment(text);
  const refs = segs.map((s) => s.clauseRef);

  it("finds numbered and lettered clauses", () => {
    expect(refs).toContain("12.1");
    expect(refs).toContain("12.3");
    expect(refs).not.toContain("12"); // pure parent heading becomes section path only
  });
  it("keeps offsets exact", () => {
    for (const s of segs) expect(text.slice(s.charStart, s.charEnd)).toBe(s.text);
  });
  it("builds section paths", () => {
    const c = segs.find((s) => s.clauseRef === "12.3")!;
    expect(c.sectionPath).toEqual(["12 Limitation of Liability", "12.3"]);
  });
  it("captures a preamble", () => {
    expect(segs[0].clauseRef).toBeNull();
  });
  it("splits lettered sub-clauses under their parent", () => {
    expect(refs).toEqual(expect.arrayContaining(["12.2", "12.2(a)", "12.2(b)"]));
    const b = segs.find((s) => s.clauseRef === "12.2(b)")!;
    expect(b.sectionPath).toEqual(["12 Limitation of Liability", "12.2 Exclusions", "12.2(b)"]);
    expect(refs).not.toContain("13"); // trailing heading-only fragment is merged away
  });
  it("merges short fragments into the previous clause", () => {
    const t = "1.1 The Supplier shall deliver the Services on time and in full.\n(a) Short.\n1.2 The Customer shall pay promptly on receipt of each invoice.";
    const s = segment(t);
    expect(s.map((x) => x.clauseRef)).toEqual(["1.1", "1.2"]);
    expect(s[0].text).toContain("(a) Short.");
  });
});

describe("segment: article style fixture", () => {
  const segs = segment(read("fixtures/article-style.txt").toString());
  it("splits Section refs under Articles", () => {
    expect(segs.map((s) => s.clauseRef)).toEqual(["1.1", "1.2", "2.1", "2.2", "3.1"]);
    expect(segs[2].sectionPath[0]).toMatch(/^Article II/);
  });
});

describe("segment: edge cases", () => {
  it("returns a single preamble clause when no headings exist", () => {
    const t = "Just a long paragraph of text with no numbering at all, long enough to keep.";
    const s = segment(t);
    expect(s).toHaveLength(1);
    expect(s[0].text).toBe(t);
  });
  it("returns nothing for empty input", () => expect(segment("  \n ")).toEqual([]));
  it("does not treat numeric amounts as headings", () => {
    const t = "1. Fees\n30 days after the invoice date the Customer shall pay all outstanding sums.";
    expect(segment(t).map((s) => s.clauseRef)).not.toContain("30");
  });
});

describe("bboxesForRange", () => {
  it("unions spans per page", () => {
    const spans = [
      { start: 0, end: 5, page: 1, x: 10, y: 100, w: 50, h: 10 },
      { start: 6, end: 11, page: 1, x: 10, y: 80, w: 70, h: 10 },
      { start: 12, end: 20, page: 2, x: 5, y: 700, w: 30, h: 10 },
    ];
    expect(bboxesForRange(spans, 0, 20)).toEqual([
      { page: 1, x: 10, y: 80, w: 70, h: 30 },
      { page: 2, x: 5, y: 700, w: 30, h: 10 },
    ]);
    expect(bboxesForRange(spans, 30, 40)).toEqual([]);
  });
});

describe("sample MSA PDF", () => {
  it("yields clauses that all carry a bbox", async () => {
    const r = await ingestBuffer(read("sample-msa.pdf"), "sample-msa.pdf");
    expect(r.pageCount).toBe(2);
    expect(r.clauses.length).toBeGreaterThanOrEqual(15);
    expect(r.clauses.map((c) => c.clauseRef)).toEqual(expect.arrayContaining(["3.1", "8.2", "10.1"]));
    for (const c of r.clauses) {
      expect(c.bboxJson?.length).toBeGreaterThan(0);
      expect(r.text.slice(c.charStart, c.charEnd)).toBe(c.text);
    }
  });
  it("rejects PDFs with no text", async () => {
    const blank = Buffer.from(
      "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R/Size 4>>\n%%EOF",
    );
    await expect(ingestBuffer(blank, "x.pdf")).rejects.toBeInstanceOf(ScannedPdfError);
  });
});

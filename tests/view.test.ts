import { describe, expect, it } from "vitest";
import { bboxToRect, coverage, modelsUsed, sortFindings, type FindingView } from "@/lib/review/view";

const f = (o: Partial<FindingView> & { id: string }): FindingView => ({
  clauseId: o.id, clauseRef: o.id, clauseText: "t", pageNumber: 1, bbox: null, ruleKey: "r", ruleName: "R",
  riskLevel: "none", deviationReason: null, sourceSpan: null, confidence: "high", citationVerified: true,
  retrievalDebug: null, modelUsed: null, ...o,
});

describe("bboxToRect", () => {
  it("flips the PDF y-axis and scales to pixels", () => {
    // 792pt-tall page; a 20pt-tall box whose bottom sits 100pt above the page bottom
    const r = bboxToRect({ x: 72, y: 100, w: 200, h: 20 }, 792, 1.5);
    expect(r).toEqual({ left: 108, top: (792 - 120) * 1.5, width: 300, height: 30 });
  });
  it("pads the sides and bottom (descenders) without moving the top edge", () => {
    const plain = bboxToRect({ x: 72, y: 100, w: 200, h: 10 }, 792, 2);
    const padded = bboxToRect({ x: 72, y: 100, w: 200, h: 10 }, 792, 2, { x: 3, bottom: 3, top: 0 });
    expect(padded.top).toBe(plain.top);
    expect(padded.left).toBe(plain.left - 6);
    expect(padded.width).toBe(plain.width + 12);
    expect(padded.height).toBe(plain.height + 6);
    // bottom edge moves down the page by exactly the bottom padding
    expect(padded.top + padded.height).toBe(plain.top + plain.height + 6);
  });
  it("puts a box at the very top of the page at top = 0", () => {
    expect(bboxToRect({ x: 0, y: 772, w: 10, h: 20 }, 792, 1).top).toBe(0);
  });
});

describe("coverage", () => {
  it("counts checked clauses, deviations, low-confidence and missing separately", () => {
    const c = coverage([
      f({ id: "1" }),
      f({ id: "2", riskLevel: "high" }),
      f({ id: "3", riskLevel: "medium", confidence: "low" }),
      f({ id: "4", riskLevel: "low", citationVerified: false }),
      f({ id: "m", clauseId: null, riskLevel: "medium" }),
    ]);
    expect(c).toEqual({ checked: 4, deviations: 3, lowConfidence: 2, missing: 1 });
  });
  it("does not count a clean 'none' finding as low-confidence", () => {
    expect(coverage([f({ id: "1", confidence: "low" })]).lowConfidence).toBe(0);
  });
});

describe("sortFindings", () => {
  const list = [
    f({ id: "a", riskLevel: "low" }),
    f({ id: "m", clauseId: null, riskLevel: "high" }),
    f({ id: "b", riskLevel: "high" }),
    f({ id: "c", riskLevel: "none" }),
  ];
  it("sorts by risk, keeping document order within a tier and clause findings before missing ones", () => {
    expect(sortFindings(list, "risk").map((x) => x.id)).toEqual(["b", "m", "a", "c"]);
  });
  it("sorts by document order with missing-clause findings last", () => {
    expect(sortFindings(list, "order").map((x) => x.id)).toEqual(["a", "b", "c", "m"]);
  });
  it("does not mutate its input", () => {
    const copy = [...list];
    sortFindings(list, "risk");
    expect(list).toEqual(copy);
  });
});

describe("modelsUsed", () => {
  it("lists distinct models and ignores findings that skipped the LLM", () => {
    expect(modelsUsed([f({ id: "1", modelUsed: "groq:x" }), f({ id: "2", modelUsed: "groq:x" }), f({ id: "3" })])).toEqual(["groq:x"]);
  });
});

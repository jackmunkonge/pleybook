import { describe, expect, it } from "vitest";
import { compareBaseline, summarizeComparison } from "@/lib/review/baseline-compare";
import type { FindingView } from "@/lib/review/view";

const f = (o: Partial<FindingView> & { id: string }): FindingView => ({
  clauseId: o.id, clauseRef: o.id, clauseText: "text", pageNumber: 1, bbox: null, ruleKey: "r", ruleName: "R",
  riskLevel: "high", deviationReason: null, sourceSpan: null, confidence: "high", citationVerified: true,
  retrievalDebug: null, modelUsed: null, ...o,
});
const risk = (quote: string) => ({ title: "t", risk_level: "high" as const, explanation: "e", quote });

describe("compareBaseline", () => {
  const liab = f({ id: "a", clauseText: "The Supplier's liability under this Agreement is unlimited." });
  const term = f({ id: "b", clauseText: "Either party may terminate on 5 days notice." });
  const ok = f({ id: "c", riskLevel: "none", clauseText: "This Agreement is governed by English law." });
  const missing = f({ id: "m", clauseId: null, clauseText: null, clauseRef: null });

  it("credits a baseline risk whose quote sits in a flagged clause, and lists the rest as missed", () => {
    const c = compareBaseline([liab, term, missing], [risk("liability under this Agreement is unlimited")]);
    expect(c.caught.map((x) => x.finding.id)).toEqual(["a"]);
    expect(c.missed.map((x) => x.id)).toEqual(["b", "m"]);
    expect(summarizeComparison(c)).toEqual({ pipelineTotal: 3, caught: 1, missed: 2, missingClauses: 1, extra: 0 });
  });
  it("counts a risk in a clause the pipeline cleared, or with an invented quote, as extra", () => {
    const c = compareBaseline([liab, ok], [risk("governed by English law"), risk("this sentence is not in the contract")]);
    expect(c.extra).toEqual([
      expect.objectContaining({ clauseRef: "c", quoteFound: true }),
      expect.objectContaining({ clauseRef: null, quoteFound: false }),
    ]);
    expect(c.missed.map((x) => x.id)).toEqual(["a"]);
  });
  it("credits each pipeline finding only once", () => {
    const c = compareBaseline([liab], [risk("liability under this Agreement is unlimited"), risk("Supplier's liability under this Agreement")]);
    expect(c.caught).toHaveLength(1);
  });
});

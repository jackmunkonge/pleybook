import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { segment } from "@/lib/ingest/segment";
import { loadGold } from "@/lib/eval/gold";
import { computeMetrics, containsSpan, fixedChunks, scoreContract, spreadSample, sumCounts } from "@/lib/eval/metrics";
import type { GoldContract, ScoredUnit } from "@/lib/eval/types";

const playbook = JSON.parse(fs.readFileSync(path.join(__dirname, "../data/playbook.json"), "utf8")) as { key: string }[];
const ruleKeys = new Set(playbook.map((r) => r.key));

describe("gold set", () => {
  const gold = loadGold();

  it("has the planned size", () => {
    expect(gold.length).toBeGreaterThanOrEqual(10);
    expect(gold.length).toBeLessThanOrEqual(15);
    const n = gold.reduce((s, g) => s + g.findings.length, 0);
    expect(n).toBeGreaterThanOrEqual(40);
    expect(n).toBeLessThanOrEqual(60);
  });

  it("uses real playbook rules and covers most of them", () => {
    const used = new Set<string>();
    for (const g of gold) {
      for (const f of g.findings) {
        expect(ruleKeys.has(f.rule_key), `${g.id}: ${f.rule_key}`).toBe(true);
        used.add(f.rule_key);
      }
      for (const m of g.missing) expect(ruleKeys.has(m), `${g.id} missing ${m}`).toBe(true);
    }
    expect(used.size).toBeGreaterThanOrEqual(12);
  });

  it("anchors every labelled span in exactly the clause it names", () => {
    for (const g of gold) {
      const segs = segment(g.text);
      for (const f of g.findings) {
        const home = segs.filter((s) => s.text.includes(f.span));
        expect(home.length, `${g.id} ${f.clause_ref}: span must appear in one clause`).toBe(1);
        expect(home[0].clauseRef, `${g.id}: span is in the wrong clause`).toBe(f.clause_ref);
      }
    }
  });

  it("never labels a rule both deviating and missing", () => {
    for (const g of gold) for (const f of g.findings) expect(g.missing).not.toContain(f.rule_key);
  });
});

const unit = (over: Partial<ScoredUnit> & { text: string }): ScoredUnit => ({
  ref: null, flagged: false, ruleKey: null, riskLevel: "none", span: null, reason: null, confidence: null, ...over,
});
const goldContract: GoldContract = {
  id: "t", kind: "MSA", file: "t.txt",
  findings: [{ clause_ref: "1.1", rule_key: "payment-terms", span: "within 7 days" }],
  missing: ["service-levels", "price-changes"],
};

describe("scoreContract", () => {
  it("counts a flagged unit containing the span as recalled, with rule credit only for the right rule", () => {
    const right = scoreContract(goldContract, [unit({ text: "Pay within 7 days.", flagged: true, riskLevel: "high", ruleKey: "payment-terms", span: "within 7 days" })], null);
    expect(right.counts.goldHit).toBe(1);
    expect(right.counts.goldRuleHit).toBe(1);
    const wrong = scoreContract(goldContract, [unit({ text: "Pay within 7 days.", flagged: true, riskLevel: "high", ruleKey: "liability-cap", span: "within 7 days" })], null);
    expect(wrong.counts.goldHit).toBe(1);
    expect(wrong.counts.goldRuleHit).toBe(0);
    expect(wrong.misses[0].reason).toBe("model-wrong-rule");
  });

  it("computes false positives over non-gold units only", () => {
    const s = scoreContract(goldContract, [
      unit({ text: "Pay within 7 days.", flagged: true, ruleKey: "payment-terms", span: "within 7 days" }),
      unit({ text: "Governed by English law.", flagged: true, span: "English law" }),
      unit({ text: "Entire agreement." }),
      unit({ text: "Notices in writing." }),
    ], null);
    expect(s.counts.nonGoldUnits).toBe(3);
    expect(s.counts.nonGoldFlagged).toBe(1);
    expect(computeMetrics(s.counts, false, null).fpRate).toBeCloseTo(1 / 3);
  });

  it("checks citations of flagged units against their own text; a missing span is invalid", () => {
    const s = scoreContract(goldContract, [
      unit({ text: "Pay within 7 days.", flagged: true, span: "within 7 days" }),
      unit({ text: "Some other clause text here.", flagged: true, span: "invented quote that is not present" }),
      unit({ text: "Third clause text here.", flagged: true, span: null }),
    ], null);
    expect(s.counts.citationChecked).toBe(3);
    expect(s.counts.citationValid).toBe(1);
  });

  it("classifies why a gold finding was missed", () => {
    const home = (retrieval: ScoredUnit["retrieval"]) => scoreContract(goldContract, [unit({ text: "Pay within 7 days.", retrieval })], null).misses[0].reason;
    expect(scoreContract(goldContract, [unit({ text: "unrelated" })], null).misses[0].reason).toBe("no-unit");
    expect(home({ relevant: false, topRuleKey: null, reranked: false })).toBe("filtered");
    expect(home({ relevant: true, topRuleKey: "liability-cap", reranked: false })).toBe("wrong-rule");
    expect(home({ relevant: true, topRuleKey: "payment-terms", reranked: false })).toBe("model-said-none");
  });

  it("scores missing-clause detection as precision and recall against the gold list", () => {
    const s = scoreContract(goldContract, [], ["service-levels", "data-protection"]);
    expect(s.counts).toMatchObject({ missingGold: 2, missingPredicted: 2, missingHit: 1 });
    const m = computeMetrics(sumCounts([s.counts]), true, null);
    expect(m.missingRecall).toBe(0.5);
    expect(m.missingPrecision).toBe(0.5);
    expect(computeMetrics(s.counts, false, null).missingRecall).toBeNull();
  });
});

describe("helpers", () => {
  it("matches spans ignoring quote and whitespace differences", () => {
    expect(containsSpan("The “Supplier”   may  terminate", 'the "Supplier" may terminate')).toBe(true);
    expect(containsSpan("abc", "xyz")).toBe(false);
  });
  it("chunks without regard for boundaries", () => {
    expect(fixedChunks("a".repeat(2500), 1000).map((c) => c.length)).toEqual([1000, 1000, 500]);
  });
  it("samples evenly and deterministically", () => {
    expect(spreadSample([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5)).toEqual([1, 3, 5, 7, 9]);
    expect(spreadSample([1, 2], 5)).toEqual([1, 2]);
  });
});

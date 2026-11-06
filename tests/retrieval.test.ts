import { describe, expect, it } from "vitest";
import {
  RRF_K,
  isRelevant,
  keyTermsQuery,
  margin,
  needsRerank,
  rrf,
  tokenCount,
  uncoveredRules,
} from "@/lib/retrieval/fusion";

describe("rrf", () => {
  it("scores 1/(k+rank) per list and sums across lists", () => {
    const out = rrf([["a", "b"], ["b", "c"]]);
    const by = Object.fromEntries(out.map((o) => [o.id, o]));
    expect(by.a.score).toBeCloseTo(1 / (RRF_K + 1));
    expect(by.b.score).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1));
    expect(by.c.score).toBeCloseTo(1 / (RRF_K + 2));
  });
  it("ranks an item found by both lists above one found by a single list", () => {
    expect(rrf([["a", "b"], ["b", "c"]])[0].id).toBe("b");
  });
  it("records 1-based ranks and null when absent", () => {
    const b = rrf([["a", "b"], ["b"]]).find((o) => o.id === "b")!;
    expect(b.ranks).toEqual([2, 1]);
    expect(rrf([["a"], []])[0].ranks).toEqual([1, null]);
  });
  it("is deterministic on ties", () => {
    expect(rrf([["b"], ["a"]]).map((o) => o.id)).toEqual(["a", "b"]);
  });
  it("handles empty input", () => {
    expect(rrf([[], []])).toEqual([]);
  });
});

describe("margin", () => {
  it("is the normalized gap between the top two", () => {
    expect(margin([0.5, 0.4, 0.1])).toBeCloseTo(0.2);
  });
  it("is order-independent", () => {
    expect(margin([0.4, 0.5])).toBeCloseTo(0.2);
  });
  it("is 1 for a single candidate and 0 for none or all-zero", () => {
    expect(margin([0.3])).toBe(1);
    expect(margin([])).toBe(0);
    expect(margin([0, 0])).toBe(0);
  });
  it("is 0 for an exact tie", () => {
    expect(margin([0.3, 0.3])).toBe(0);
  });
});

describe("needsRerank", () => {
  const base = { margin: 0.5, tokens: 100, relevant: true, candidates: 5 };
  it("skips clear winners", () => expect(needsRerank(base)).toBe(false));
  it("reranks close calls", () => expect(needsRerank({ ...base, margin: 0.05 })).toBe(true));
  it("reranks very short clauses", () => expect(needsRerank({ ...base, tokens: 10 })).toBe(true));
  it("never reranks irrelevant clauses or single candidates", () => {
    expect(needsRerank({ ...base, margin: 0, relevant: false })).toBe(false);
    expect(needsRerank({ ...base, margin: 0, candidates: 1 })).toBe(false);
  });
});

describe("isRelevant / tokenCount", () => {
  it("applies the similarity threshold", () => {
    expect(isRelevant(0.78)).toBe(true);
    expect(isRelevant(0.69)).toBe(false);
    expect(isRelevant(null)).toBe(false);
  });
  it("relaxes the bar when both retrievers agree on the top rule", () => {
    expect(isRelevant(0.733)).toBe(false);
    expect(isRelevant(0.733, true)).toBe(true);
    expect(isRelevant(0.688, true)).toBe(false);
  });
  it("counts whitespace-separated tokens", () => expect(tokenCount("  a b\n c ")).toBe(3));
});

describe("keyTermsQuery", () => {
  it("drops stopwords and short words, dedupes, and OR-joins", () => {
    const q = keyTermsQuery("The supplier shall indemnify the customer; indemnify and defend claims.");
    const terms = q.split(" | ");
    expect(terms[0]).toBe("indemnify");
    expect(terms).toContain("supplier");
    expect(terms).not.toContain("the");
    expect(new Set(terms).size).toBe(terms.length);
  });
  it("only emits letters, so it is safe to feed to to_tsquery", () => {
    expect(keyTermsQuery("a'; DROP TABLE x; -- & | ! 123 liability")).toMatch(/^[a-z]+( \| [a-z]+)*$/);
  });
  it("returns empty string when nothing usable", () => expect(keyTermsQuery("a an 12")).toBe(""));
});

describe("uncoveredRules", () => {
  it("returns rules no clause matched", () => {
    expect(uncoveredRules(["a", "b", "c"], ["a", null, "a"])).toEqual(["b", "c"]);
  });
});

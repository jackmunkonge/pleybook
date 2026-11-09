import { describe, expect, it } from "vitest";
import { capConfidence, validateCitation } from "@/lib/validate/citation";

const clause = `12.4 Limitation of Liability. The Supplier’s total aggregate liability under this Agreement shall be unlimited, and the Supplier shall indemnify the Customer for “all losses” arising from any breach.`;

describe("validateCitation", () => {
  it("accepts an exact substring", () => {
    const r = validateCitation("total aggregate liability under this Agreement shall be unlimited", clause);
    expect(r).toMatchObject({ verified: true, method: "exact" });
  });
  it("accepts whitespace, case and curly-quote differences as normalized", () => {
    const r = validateCitation('The Supplier\'s  total aggregate\nliability under this agreement', clause);
    expect(r).toMatchObject({ verified: true, method: "normalized" });
    expect(validateCitation('indemnify the Customer for "all losses"', clause).verified).toBe(true);
  });
  it("accepts a near-exact quote via the fuzzy path", () => {
    const longClause = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ");
    const span = Array.from({ length: 40 }, (_, i) => (i === 17 ? "wordX" : `word${i}`)).join(" ");
    const r = validateCitation(span, longClause);
    expect(r.method).toBe("fuzzy");
    expect(r.verified).toBe(true);
  });
  it("rejects a fabricated quote", () => {
    const r = validateCitation("liability is capped at twelve months of fees", clause);
    expect(r.verified).toBe(false);
    expect(r.method).toBe("none");
  });
  it("rejects a paraphrase that reorders words", () => {
    expect(validateCitation("unlimited shall be liability aggregate total", clause).verified).toBe(false);
  });
  it("rejects empty or missing spans", () => {
    expect(validateCitation("", clause).verified).toBe(false);
    expect(validateCitation(null, clause).verified).toBe(false);
    expect(validateCitation("   ", clause).verified).toBe(false);
  });
});

describe("capConfidence", () => {
  it("caps at low when unverified and leaves verified findings alone", () => {
    expect(capConfidence("high", false)).toBe("low");
    expect(capConfidence("medium", true)).toBe("medium");
  });
});

import { describe, expect, it } from "vitest";
import { AllProvidersFailedError, withFallback, type ProviderSlot } from "@/lib/llm/fallback";
import { TokenBucket } from "@/lib/llm/limiter";
import { buildPrompt, checkCoverage, type ReviewItem } from "@/lib/llm/review";
import { finalizeAssessment } from "@/lib/review/finalize";

const slot = (name: string): ProviderSlot<string> => ({ name, modelId: `${name}-model`, model: name });
const httpError = (statusCode: number) => Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });

describe("withFallback", () => {
  it("returns the first provider when it succeeds", async () => {
    const r = await withFallback([slot("a"), slot("b")], async (m) => m);
    expect(r.value).toBe("a");
    expect(r.used.name).toBe("a");
    expect(r.attempts).toHaveLength(1);
  });
  it("moves to the next provider on a 429", async () => {
    const r = await withFallback([slot("gemini"), slot("groq")], async (m) => {
      if (m === "gemini") throw httpError(429);
      return "ok";
    });
    expect(r.used.name).toBe("groq");
    expect(r.attempts[0]).toMatchObject({ provider: "gemini", ok: false, status: 429 });
    expect(r.attempts[1]).toMatchObject({ provider: "groq", ok: true });
  });
  it("falls through on 5xx and on rejected output", async () => {
    const r = await withFallback([slot("a"), slot("b"), slot("c")], async (m) => {
      if (m === "a") throw httpError(503);
      if (m === "b") throw new Error("Model assessed 3 of 4 clauses");
      return m;
    });
    expect(r.used.name).toBe("c");
  });
  it("throws with the full attempt log when every provider fails", async () => {
    const err = await withFallback([slot("a"), slot("b")], async () => {
      throw httpError(429);
    }).catch((e) => e);
    expect(err).toBeInstanceOf(AllProvidersFailedError);
    expect(err.attempts.map((a: { provider: string }) => a.provider)).toEqual(["a", "b"]);
  });
  it("calls the rate limiter before each attempt", async () => {
    const calls: string[] = [];
    const s = { ...slot("a"), take: async () => void calls.push("take") };
    await withFallback([s], async () => "x");
    expect(calls).toEqual(["take"]);
  });
});

describe("TokenBucket", () => {
  it("lets a burst through, then waits for refill", async () => {
    let now = 0;
    const sleeps: number[] = [];
    const b = new TokenBucket(1, 0.5, () => now, async (ms) => {
      sleeps.push(ms);
      now += ms;
    });
    await b.take();
    expect(sleeps).toEqual([]);
    await b.take();
    expect(sleeps).toEqual([2000]);
  });
});

const items: ReviewItem[] = ["c1", "c2"].map((id) => ({
  id,
  clauseRef: id,
  text: `text ${id}`,
  rule: { key: "liability-cap", name: "Cap", text: "must cap", preferred: null, fallback: null },
}));
const a = (clause_id: string) => ({
  clause_id, risk_level: "none" as const, deviation_reason: "ok", playbook_rule_id: null, source_span: "", confidence: "high" as const,
});

describe("checkCoverage", () => {
  it("accepts exactly one assessment per clause", () => {
    expect(() => checkCoverage(items, [a("c2"), a("c1")])).not.toThrow();
  });
  it("rejects missing, duplicate and unknown ids", () => {
    expect(() => checkCoverage(items, [a("c1")])).toThrow(/1 of 2/);
    expect(() => checkCoverage(items, [a("c1"), a("c1")])).toThrow(/duplicate/);
    expect(() => checkCoverage(items, [a("c1"), a("zz")])).toThrow(/unknown/);
  });
});

describe("buildPrompt", () => {
  it("wraps clause text and rule per item", () => {
    const p = buildPrompt(items);
    expect(p).toContain('<clause id="c1" ref="c1">');
    expect(p).toContain('<rule id="liability-cap" for="c2">');
  });
});

describe("finalizeAssessment", () => {
  const clauseText = "The Supplier's liability shall be unlimited for all claims.";
  const base = { clause_id: "c1", deviation_reason: "bad", playbook_rule_id: "liability-cap", confidence: "high" as const };
  it("keeps confidence when the quote is verified", () => {
    const f = finalizeAssessment({ ...base, risk_level: "high", source_span: "liability shall be unlimited" }, clauseText, "liability-cap");
    expect(f).toMatchObject({ citationVerified: true, confidence: "high", playbookRuleKey: "liability-cap" });
  });
  it("flags a fabricated quote and caps confidence at low", () => {
    const f = finalizeAssessment({ ...base, risk_level: "high", source_span: "liability is capped at 12 months" }, clauseText, "liability-cap");
    expect(f).toMatchObject({ citationVerified: false, confidence: "low" });
  });
  it("treats a spanless 'none' as nothing to cite, but a spanless deviation as unverified", () => {
    expect(finalizeAssessment({ ...base, risk_level: "none", source_span: "" }, clauseText, "liability-cap").citationVerified).toBe(true);
    expect(finalizeAssessment({ ...base, risk_level: "medium", source_span: "" }, clauseText, "liability-cap").citationVerified).toBe(false);
  });
  it("drops a rule id the model invented", () => {
    const f = finalizeAssessment({ ...base, playbook_rule_id: "made-up", risk_level: "none", source_span: "" }, clauseText, "liability-cap");
    expect(f.playbookRuleKey).toBeNull();
  });
});

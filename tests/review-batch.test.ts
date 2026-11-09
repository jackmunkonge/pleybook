import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import { AllProvidersFailedError, type ProviderSlot } from "@/lib/llm/fallback";
import { reviewBatch, type ReviewItem } from "@/lib/llm/review";

const items: ReviewItem[] = [
  { id: "c1", clauseRef: "8.2", text: "Liability is unlimited.", rule: { key: "liability-cap", name: "Cap", text: "cap it", preferred: null, fallback: null } },
];
const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const answering = (json: unknown) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text: JSON.stringify(json) }],
      finishReason: { unified: "stop", raw: undefined },
      usage,
      warnings: [],
    }),
  });
const failing = (statusCode: number) =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw Object.assign(new Error(`HTTP ${statusCode}`), { statusCode });
    },
  });
const slot = (name: string, model: MockLanguageModelV4): ProviderSlot<never> =>
  ({ name, modelId: `${name}-m`, model }) as unknown as ProviderSlot<never>;

const good = {
  assessments: [
    { clause_id: "c1", risk_level: "high", deviation_reason: "no cap", playbook_rule_id: "liability-cap", source_span: "Liability is unlimited", confidence: "high" },
  ],
};

describe("reviewBatch", () => {
  it("returns assessments and records which model answered", async () => {
    const r = await reviewBatch(items, [slot("gemini", answering(good))]);
    expect(r.modelUsed).toBe("gemini:gemini-m");
    expect(r.assessments[0].risk_level).toBe("high");
  });
  it("falls back to the next provider on a 429 and logs both attempts", async () => {
    const r = await reviewBatch(items, [slot("gemini", failing(429)), slot("groq", answering(good))]);
    expect(r.modelUsed).toBe("groq:groq-m");
    expect(r.attempts).toMatchObject([{ provider: "gemini", ok: false, status: 429 }, { provider: "groq", ok: true }]);
  });
  it("treats an answer that skips a clause as a failure and tries the next provider", async () => {
    const r = await reviewBatch(items, [slot("gemini", answering({ assessments: [] })), slot("groq", answering(good))]);
    expect(r.modelUsed).toBe("groq:groq-m");
  });
  it("treats schema-invalid output as a failure", async () => {
    const bad = { assessments: [{ clause_id: "c1", risk_level: "catastrophic" }] };
    const r = await reviewBatch(items, [slot("gemini", answering(bad)), slot("groq", answering(good))]);
    expect(r.modelUsed).toBe("groq:groq-m");
  });
  it("throws AllProvidersFailedError when every provider fails", async () => {
    await expect(reviewBatch(items, [slot("gemini", failing(429)), slot("groq", failing(503))])).rejects.toBeInstanceOf(
      AllProvidersFailedError,
    );
  });
  it("throws a clear error when no provider is configured", async () => {
    await expect(reviewBatch(items, [])).rejects.toThrow(/No LLM provider configured/);
  });
});

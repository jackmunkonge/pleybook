import fs from "node:fs";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModel } from "ai";
import type { ProviderSlot } from "./fallback";

/**
 * Deterministic stand-in for the model providers, used only by the Playwright suite (`E2E_STUB_LLM=1`).
 * Never active in production builds. Mode is read from `E2E_STUB_MODE_FILE` on every call so a test can
 * flip the "providers" between answering and down while the server keeps running.
 */
export function e2eStubEnabled() {
  return process.env.E2E_STUB_LLM === "1" && process.env.NODE_ENV !== "production";
}

function mode(): "ok" | "down" {
  const file = process.env.E2E_STUB_MODE_FILE;
  try {
    return file && fs.readFileSync(file, "utf8").trim() === "down" ? "down" : "ok";
  } catch {
    return "ok";
  }
}

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

/** Reads each `<clause id="cN">` out of the prompt and flags it high risk, quoting its first words verbatim. */
export function stubAssessments(prompt: string) {
  const ruleFor = new Map([...prompt.matchAll(/<rule id="([^"]+)" for="([^"]+)">/g)].map(([, rule, id]) => [id, rule]));
  const out = [...prompt.matchAll(/<clause id="([^"]+)"[^>]*>\n([\s\S]*?)\n<\/clause>/g)].map(([, id, text]) => ({
    clause_id: id,
    risk_level: "high" as const,
    deviation_reason: "Stubbed assessment for end-to-end tests.",
    playbook_rule_id: ruleFor.get(id) ?? null,
    source_span: text.trim().split(/\s+/).slice(0, 6).join(" "),
    confidence: "high" as const,
  }));
  return { assessments: out };
}

function stubModel(): LanguageModel {
  return new MockLanguageModelV4({
    doGenerate: async (options) => {
      if (mode() === "down") throw Object.assign(new Error("HTTP 503 (stubbed outage)"), { statusCode: 503 });
      const text = options.prompt
        .flatMap((m) => (typeof m.content === "string" ? [m.content] : m.content.map((p) => ("text" in p ? p.text : ""))))
        .join("\n");
      return {
        content: [{ type: "text", text: JSON.stringify(stubAssessments(text)) }],
        finishReason: { unified: "stop", raw: undefined },
        usage,
        warnings: [],
      };
    },
  }) as unknown as LanguageModel;
}

export function stubProviderChain(): ProviderSlot<LanguageModel>[] {
  return [{ name: "gemini", modelId: "stub-model", model: stubModel() }];
}

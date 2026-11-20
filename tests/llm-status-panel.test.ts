import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LlmStatusPanel } from "@/components/LlmStatusPanel";
import { buildProviderPanel } from "@/lib/review/provider-status";

const chain = [
  { name: "gemini", modelId: "gemini-3.8-flash" },
  { name: "groq", modelId: "openai/gpt-oss-120b" },
];
const log = [{ modelUsed: "groq:openai/gpt-oss-120b", attempts: [{ provider: "gemini", model: "m", ok: false, status: 429 }, { provider: "groq", model: "m", ok: true }] }];
const panel = buildProviderPanel(chain, log, { status: "running", cached: false, progress: 8, totalClauses: 19 }, 8);

describe("LlmStatusPanel", () => {
  const html = renderToStaticMarkup(createElement(LlmStatusPanel, { panel }));

  it("is collapsed by default and shows only who is working now", () => {
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("Groq");
    expect(html).toContain("Fallback in use");
    expect(html).not.toContain("Rate limited"); // per-provider detail stays hidden until expanded
    expect(html).not.toContain("<ul");
  });
  it("renders nothing when no provider is configured", () => {
    const empty = buildProviderPanel([], [], { status: "running", cached: false, progress: 0, totalClauses: 19 }, 8);
    expect(renderToStaticMarkup(createElement(LlmStatusPanel, { panel: empty }))).toBe("");
  });
});

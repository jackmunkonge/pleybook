import { describe, expect, it } from "vitest";
import { buildPrompt } from "@/lib/llm/review";
import { checkCoverage } from "@/lib/llm/review";
import { finalizeAssessment } from "@/lib/review/finalize";
import { stubAssessments } from "@/lib/llm/e2e-stub";

const rule = { key: "liability-cap", name: "Cap", text: "t", preferred: null, fallback: null };
const items = [
  { id: "c1", clauseRef: "8.2", text: "Liability is unlimited for all claims.", rule },
  { id: "c2", clauseRef: "9", text: "Either party may terminate on thirty days notice.", rule },
];

describe("e2e model stub", () => {
  it("answers every clause in the real prompt format, with quotes that pass citation validation", () => {
    const { assessments } = stubAssessments(buildPrompt(items));
    expect(() => checkCoverage(items, assessments)).not.toThrow();
    for (const [i, a] of assessments.entries()) {
      const f = finalizeAssessment(a, items[i].text, rule.key);
      expect(f.citationVerified).toBe(true);
      expect(f.playbookRuleKey).toBe("liability-cap");
    }
  });
});

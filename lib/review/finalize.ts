import { capConfidence, validateCitation, type Confidence } from "@/lib/validate/citation";
import type { Assessment } from "@/lib/llm/review";

export type FindingDraft = {
  riskLevel: "none" | "low" | "medium" | "high";
  deviationReason: string;
  sourceSpan: string | null;
  confidence: Confidence;
  citationVerified: boolean;
  playbookRuleKey: string | null;
};

/**
 * Turn a raw model assessment into a finding: deterministically verify the quoted span against the
 * clause, and cap confidence at "low" when it fails. A "none" finding with no quote has nothing to
 * cite, so it counts as verified; anything else needs a span that really occurs in the clause.
 */
export function finalizeAssessment(a: Assessment, clauseText: string, ruleKey: string): FindingDraft {
  const span = a.source_span.trim();
  const noCitationNeeded = a.risk_level === "none" && span === "";
  const citationVerified = noCitationNeeded || validateCitation(span, clauseText).verified;
  return {
    riskLevel: a.risk_level,
    deviationReason: a.deviation_reason,
    sourceSpan: span || null,
    confidence: capConfidence(a.confidence, citationVerified),
    citationVerified,
    // Only accept the rule we offered; anything else from the model is treated as "doesn't apply".
    playbookRuleKey: a.playbook_rule_id === ruleKey ? ruleKey : null,
  };
}

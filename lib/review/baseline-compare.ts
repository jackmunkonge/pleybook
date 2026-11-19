// Pure comparison helpers (no server imports) so the review UI and tests can use them.
import { validateCitation } from "@/lib/validate/citation";
import type { FindingView } from "./view";

export type BaselineReview = {
  summary: string;
  risks: { title: string; risk_level: "low" | "medium" | "high"; explanation: string; quote: string }[];
};

export type BaselineRisk = BaselineReview["risks"][number];

export type BaselineComparison = {
  /** Pipeline findings (deviations and missing clauses) the baseline did not point at. */
  missed: FindingView[];
  /** Pipeline findings the baseline also raised, with the baseline risk that matched. */
  caught: { finding: FindingView; risk: BaselineRisk }[];
  /** Baseline risks whose quote sits in a clause the pipeline did not flag (or in no clause at all). */
  extra: { risk: BaselineRisk; clauseRef: string | null; quoteFound: boolean }[];
};

/**
 * Line the baseline's risks up against the pipeline's findings. A baseline risk "points at" a clause when its
 * quote can be found inside that clause (same exact → normalized → fuzzy check the pipeline uses). Missing-clause
 * findings have no clause text, so a single-prompt review can never be credited with them.
 */
export function compareBaseline(findings: FindingView[], risks: BaselineRisk[]): BaselineComparison {
  const deviations = findings.filter((f) => f.riskLevel !== "none");
  const clauseFindings = findings.filter((f) => f.clauseId && f.clauseText);
  const caughtIds = new Set<string>();
  const caught: BaselineComparison["caught"] = [];
  const extra: BaselineComparison["extra"] = [];

  for (const risk of risks) {
    const home = clauseFindings.find((f) => validateCitation(risk.quote, f.clauseText!).verified);
    if (home && home.riskLevel !== "none") {
      if (!caughtIds.has(home.id)) caught.push({ finding: home, risk });
      caughtIds.add(home.id);
    } else {
      extra.push({ risk, clauseRef: home?.clauseRef ?? null, quoteFound: !!home });
    }
  }
  return { missed: deviations.filter((f) => !caughtIds.has(f.id)), caught, extra };
}

export function summarizeComparison(c: BaselineComparison) {
  const pipelineTotal = c.caught.length + c.missed.length;
  const missingClauses = c.missed.filter((f) => !f.clauseId).length;
  return { pipelineTotal, caught: c.caught.length, missed: c.missed.length, missingClauses, extra: c.extra.length };
}


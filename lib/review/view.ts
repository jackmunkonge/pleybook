// Pure helpers for the review UI (no React, no server imports) so they can be unit-tested.

export type Risk = "none" | "low" | "medium" | "high";
export type Confidence = "low" | "medium" | "high";

export type FindingView = {
  id: string;
  clauseId: string | null;
  clauseRef: string | null;
  clauseText: string | null;
  pageNumber: number | null;
  bbox: { page: number; x: number; y: number; w: number; h: number }[] | null;
  ruleKey: string | null;
  ruleName: string | null;
  riskLevel: Risk;
  deviationReason: string | null;
  sourceSpan: string | null;
  confidence: Confidence | null;
  citationVerified: boolean;
  retrievalDebug: unknown;
  modelUsed: string | null;
};

export const RISK_ORDER: Record<Risk, number> = { high: 0, medium: 1, low: 2, none: 3 };

export function coverage(findings: FindingView[]) {
  const checked = findings.filter((f) => f.clauseId);
  const deviations = checked.filter((f) => f.riskLevel !== "none");
  return {
    checked: checked.length,
    deviations: deviations.length,
    // a deviation we are less sure about, including any whose quote could not be verified
    lowConfidence: deviations.filter((f) => f.confidence === "low" || !f.citationVerified).length,
    missing: findings.filter((f) => !f.clauseId).length,
  };
}

/** Highest risk first; ties keep document order (missing-clause findings sort last within a tier). */
export function sortFindings(findings: FindingView[], by: "risk" | "order"): FindingView[] {
  const idx = new Map(findings.map((f, i) => [f.id, i]));
  const order = (a: FindingView, b: FindingView) => (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0);
  const copy = [...findings];
  if (by === "order") return copy.sort((a, b) => Number(!a.clauseId) - Number(!b.clauseId) || order(a, b));
  return copy.sort(
    (a, b) => RISK_ORDER[a.riskLevel] - RISK_ORDER[b.riskLevel] || Number(!a.clauseId) - Number(!b.clauseId) || order(a, b),
  );
}

/**
 * Breathing room around a highlight, in PDF points (so it scales with zoom). A PDF text item's box
 * runs from the baseline up to the font height, so it has no room for descenders (g, y, p) at the
 * bottom or any margin at the sides. The top is already visually fine, so it gets none.
 */
export const HIGHLIGHT_PAD = { x: 3, bottom: 3, top: 0 };

/**
 * PDF user space has its origin at the bottom-left with y growing up; the DOM has its origin at the
 * top-left. Flip y against the page height, then scale from PDF points to rendered pixels.
 */
export function bboxToRect(
  b: { x: number; y: number; w: number; h: number },
  pageHeight: number,
  scale: number,
  pad: { x: number; bottom: number; top: number } = { x: 0, bottom: 0, top: 0 },
) {
  return {
    left: (b.x - pad.x) * scale,
    top: (pageHeight - (b.y + b.h) - pad.top) * scale,
    width: (b.w + 2 * pad.x) * scale,
    height: (b.h + pad.top + pad.bottom) * scale,
  };
}

export function modelsUsed(findings: FindingView[]): string[] {
  return [...new Set(findings.map((f) => f.modelUsed).filter((m): m is string => !!m))];
}

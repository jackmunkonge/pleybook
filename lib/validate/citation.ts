export type CitationMethod = "exact" | "normalized" | "fuzzy" | "none";
export type CitationResult = { verified: boolean; method: CitationMethod; score: number };

export const FUZZY_THRESHOLD = 0.95;

/** Lowercase, unify quote/dash variants, strip punctuation noise, collapse whitespace. */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‐-―]/g, "-")
    .replace(/­/g, "")
    .replace(/[“”"'`]/g, "")
    .replace(/[^\p{L}\p{N}\s.,;:()%$-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const tokens = (s: string) => normalize(s).replace(/[.,;:()]/g, " ").split(/\s+/).filter(Boolean);

function editDistance(a: string[], b: string[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Best token-level similarity (1 - edit distance / length) of the span against any window of the clause. */
export function bestWindowSimilarity(span: string, clause: string): number {
  const s = tokens(span);
  const c = tokens(clause);
  if (s.length === 0 || c.length === 0) return 0;
  let best = 0;
  for (const size of [s.length, s.length - 1, s.length + 1]) {
    if (size < 1 || size > c.length) continue;
    for (let i = 0; i + size <= c.length; i++) {
      const sim = 1 - editDistance(s, c.slice(i, i + size)) / Math.max(s.length, size);
      if (sim > best) best = sim;
    }
  }
  return best;
}

/** Deterministic check that `span` really occurs in `clauseText`: exact, then normalized, then fuzzy (>= 0.95). */
export function validateCitation(span: string | null | undefined, clauseText: string): CitationResult {
  const trimmed = (span ?? "").trim();
  if (!trimmed) return { verified: false, method: "none", score: 0 };
  if (clauseText.includes(trimmed)) return { verified: true, method: "exact", score: 1 };
  const ns = normalize(trimmed);
  if (ns && normalize(clauseText).includes(ns)) return { verified: true, method: "normalized", score: 1 };
  const score = bestWindowSimilarity(trimmed, clauseText);
  return score >= FUZZY_THRESHOLD
    ? { verified: true, method: "fuzzy", score }
    : { verified: false, method: "none", score };
}

export type Confidence = "low" | "medium" | "high";

/** A finding whose citation failed can never claim more than low confidence. */
export function capConfidence(confidence: Confidence, verified: boolean): Confidence {
  return verified ? confidence : "low";
}

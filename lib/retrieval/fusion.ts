// Pure scoring helpers for hybrid retrieval. No I/O so they are cheap to unit test.

export const RRF_K = 60;
/** Rerank only when the top-2 fused scores are this close (normalized). */
export const MARGIN_THRESHOLD = 0.08;
/** Clauses shorter than this many tokens are ambiguous, so they are reranked too. */
export const SHORT_CLAUSE_TOKENS = 25;
/** Minimum cosine similarity for the best rule before we treat a clause as "has a matching rule". */
export const RELEVANCE_THRESHOLD = 0.55;

export type Fused = { id: string; score: number; ranks: (number | null)[] };

/** Reciprocal rank fusion over ranked id lists (best first). Ranks are 1-based. */
export function rrf(lists: string[][], k = RRF_K): Fused[] {
  const acc = new Map<string, Fused>();
  lists.forEach((list, li) => {
    list.forEach((id, i) => {
      const entry = acc.get(id) ?? { id, score: 0, ranks: lists.map(() => null) };
      entry.score += 1 / (k + i + 1);
      entry.ranks[li] = i + 1;
      acc.set(id, entry);
    });
  });
  // Tie-break on id so ordering is deterministic.
  return [...acc.values()].sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** Normalized gap between the top two scores: (s1 - s2) / s1. 1 when only one candidate, 0 when none. */
export function margin(scores: number[]): number {
  if (scores.length === 0) return 0;
  if (scores.length === 1) return 1;
  const [s1, s2] = [...scores].sort((a, b) => b - a);
  return s1 === 0 ? 0 : (s1 - s2) / s1;
}

export function tokenCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function isRelevant(topSimilarity: number | null, threshold = RELEVANCE_THRESHOLD): boolean {
  return topSimilarity !== null && topSimilarity >= threshold;
}

/** Selective rerank gate: relevant clauses that are either a close call or very short. */
export function needsRerank(opts: { margin: number; tokens: number; relevant: boolean; candidates: number }): boolean {
  if (!opts.relevant || opts.candidates < 2) return false;
  return opts.margin < MARGIN_THRESHOLD || opts.tokens < SHORT_CLAUSE_TOKENS;
}

const STOPWORDS = new Set(
  "the and for that with this shall will any such from have has been are not but may all its their which under upon other each party parties agreement herein hereof thereof than then into out our your they them these those where when while whom whose also more most only shall must".split(
    " ",
  ),
);

/** OR-joined tsquery string from a clause's key terms (letters only, so it is injection-safe). */
export function keyTermsQuery(text: string, max = 12): string {
  const freq = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[a-z]{4,}/g) ?? []) {
    if (!STOPWORDS.has(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, max)
    .map(([w]) => w)
    .join(" | ");
}

/** Reverse coverage: rule keys that no clause matched as its top relevant rule. */
export function uncoveredRules(allRuleKeys: string[], matchedTopKeys: (string | null)[]): string[] {
  const hit = new Set(matchedTopKeys.filter((k): k is string => !!k));
  return allRuleKeys.filter((k) => !hit.has(k));
}

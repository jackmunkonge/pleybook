import { normalize, validateCitation } from "@/lib/validate/citation";
import type { ContractScore, Counts, GoldContract, Metrics, Miss, MissReason, ScoredUnit } from "./types";

export const emptyCounts = (): Counts => ({
  goldFindings: 0, goldHit: 0, goldRuleHit: 0, units: 0, nonGoldUnits: 0, nonGoldFlagged: 0,
  flagged: 0, flaggedGold: 0, citationChecked: 0, citationValid: 0, missingGold: 0, missingPredicted: 0, missingHit: 0,
});

/** Does `unit` contain the gold span? Normalized, so quote/whitespace variants don't matter. */
export const containsSpan = (unitText: string, span: string) => normalize(unitText).includes(normalize(span));

const ratio = (n: number, d: number) => (d === 0 ? null : n / d);

/** Why a gold finding was not found, for failure analysis. Only meaningful for units the pipeline produced. */
function missReason(units: ScoredUnit[], gold: { span: string; rule_key: string }): MissReason {
  const home = units.find((u) => containsSpan(u.text, gold.span));
  if (!home) return "no-unit"; // fixed-size chunking split the clause, or the segmenter dropped it
  if (home.retrieval && !home.retrieval.relevant) return "filtered";
  if (home.retrieval && home.retrieval.topRuleKey !== gold.rule_key) return "wrong-rule";
  return "model-said-none"; // a flagged home unit would have counted as a hit
}

/**
 * Score one contract. A gold finding is recalled when a flagged unit contains its span; the rule-level
 * recall additionally needs the unit to carry the right rule. A unit is "gold" if it contains any gold
 * span; false positives are flagged units that contain none.
 */
export function scoreContract(
  gold: GoldContract,
  units: ScoredUnit[],
  predictedMissing: string[] | null,
): ContractScore {
  const counts = emptyCounts();
  const misses: Miss[] = [];
  counts.units = units.length;

  for (const g of gold.findings) {
    counts.goldFindings++;
    const hit = units.find((u) => u.flagged && containsSpan(u.text, g.span));
    if (hit) {
      counts.goldHit++;
      if (hit.ruleKey === g.rule_key) counts.goldRuleHit++;
      else misses.push({ contract: gold.id, clause_ref: g.clause_ref, rule_key: g.rule_key, reason: "model-wrong-rule" });
    } else {
      misses.push({ contract: gold.id, clause_ref: g.clause_ref, rule_key: g.rule_key, reason: missReason(units, g) });
    }
  }

  for (const u of units) {
    const isGold = gold.findings.some((g) => containsSpan(u.text, g.span));
    if (!isGold) counts.nonGoldUnits++;
    if (u.flagged) {
      counts.flagged++;
      if (isGold) counts.flaggedGold++;
      else counts.nonGoldFlagged++;
      counts.citationChecked++;
      if (u.span && validateCitation(u.span, u.text).verified) counts.citationValid++;
    }
  }

  if (predictedMissing) {
    counts.missingGold = gold.missing.length;
    counts.missingPredicted = predictedMissing.length;
    counts.missingHit = predictedMissing.filter((k) => gold.missing.includes(k)).length;
  }
  return { id: gold.id, kind: gold.kind, counts, misses };
}

export function sumCounts(all: Counts[]): Counts {
  const out = emptyCounts();
  for (const c of all) for (const k of Object.keys(out) as (keyof Counts)[]) out[k] += c[k];
  return out;
}

export function computeMetrics(c: Counts, hasMissingCheck: boolean, faithfulness: number | null): Metrics {
  return {
    recall: ratio(c.goldHit, c.goldFindings) ?? 0,
    ruleRecall: ratio(c.goldRuleHit, c.goldFindings) ?? 0,
    precision: ratio(c.flaggedGold, c.flagged),
    fpRate: ratio(c.nonGoldFlagged, c.nonGoldUnits) ?? 0,
    citationValidity: ratio(c.citationValid, c.citationChecked),
    missingRecall: hasMissingCheck ? ratio(c.missingHit, c.missingGold) : null,
    missingPrecision: hasMissingCheck ? ratio(c.missingHit, c.missingPredicted) : null,
    faithfulness,
  };
}

/** Fixed-size chunks with no regard for clause boundaries: the naive baseline's segmentation. */
export function fixedChunks(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    const chunk = text.slice(i, i + size).trim();
    if (chunk) out.push(chunk);
  }
  return out;
}

/** Evenly spread, deterministic sample so reruns judge the same findings. */
export function spreadSample<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.floor((i * items.length) / n)]);
}

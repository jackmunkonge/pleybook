export type GoldFinding = { clause_ref: string; rule_key: string; span: string };
export type GoldContract = { id: string; kind: string; file: string; findings: GoldFinding[]; missing: string[] };

/** One thing the pipeline assessed: a segmented clause (full) or a fixed-size chunk (naive). */
export type ScoredUnit = {
  ref: string | null;
  text: string;
  /** Pipeline flagged a risk (risk_level other than "none"). */
  flagged: boolean;
  ruleKey: string | null;
  riskLevel: "none" | "low" | "medium" | "high";
  span: string | null;
  reason: string | null;
  confidence: "low" | "medium" | "high" | null;
  /** Why retrieval did or didn't send this unit to the model (full config only). */
  retrieval?: { relevant: boolean; topRuleKey: string | null; reranked: boolean };
};

export type MissReason = "no-unit" | "filtered" | "wrong-rule" | "model-said-none" | "model-wrong-rule";

export type Counts = {
  goldFindings: number;
  goldHit: number;
  goldRuleHit: number;
  units: number;
  nonGoldUnits: number;
  nonGoldFlagged: number;
  flagged: number;
  flaggedGold: number;
  citationChecked: number;
  citationValid: number;
  missingGold: number;
  missingPredicted: number;
  missingHit: number;
};

export type Miss = { contract: string; clause_ref: string; rule_key: string; reason: MissReason };

export type ContractScore = { id: string; kind: string; counts: Counts; misses: Miss[] };

export type Metrics = {
  recall: number;
  ruleRecall: number;
  precision: number | null;
  fpRate: number;
  citationValidity: number | null;
  missingRecall: number | null;
  missingPrecision: number | null;
  faithfulness: number | null;
};

export type JudgeSample = { unit: string; contract: string; faithful: boolean; note: string };

export type ConfigResult = {
  name: "naive" | "full";
  description: string;
  metrics: Metrics;
  counts: Counts;
  perContract: ContractScore[];
  misses: Miss[];
  judge: { sampled: number; faithful: number; samples: JudgeSample[]; model: string | null };
  models: string[];
  durationSec: number;
};

export type EvalRun = {
  version: 1;
  createdAt: string;
  note?: string;
  gold: { contracts: number; findings: number; missing: number };
  configs: { naive: ConfigResult; full: ConfigResult };
};

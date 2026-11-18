import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { playbookRules } from "@/lib/db/schema";
import { embedTexts } from "@/lib/embed";
import { getProviderChain } from "@/lib/llm/providers";
import { reviewBatch, type ReviewItem } from "@/lib/llm/review";
import type { ProviderAttempt } from "@/lib/llm/fallback";
import { retrieveForClause, type RetrievalResult } from "@/lib/retrieval/hybrid";
import { maybeRerank } from "@/lib/retrieval/rerank";
import { finalizeAssessment, type FindingDraft } from "./finalize";

/** The slice of a clause the pipeline needs: enough to run without a stored row (the eval does this). */
export type ClauseInput = { clauseRef: string | null; text: string; textHash: string; embedding: number[] | null };

export type AssessedClause<C extends ClauseInput> = {
  clause: C;
  retrieval: RetrievalResult;
  retrievalDebug: Record<string, unknown>;
  /** Present only when a rule matched and the LLM assessed the clause. */
  match?: { ruleId: string; ruleKey: string; draft: FindingDraft };
};

export type AssessResult<C extends ClauseInput> = {
  assessed: AssessedClause<C>[];
  modelUsed: string | null;
  attempts: ProviderAttempt[];
};

function debugFor(res: RetrievalResult) {
  const top = res.candidates[0];
  return {
    relevant: res.relevant,
    margin: res.margin,
    topSimilarity: res.topSimilarity,
    reranked: res.reranked,
    rerankWanted: res.rerankWanted,
    topRule: top
      ? { key: top.ruleKey, vectorRank: top.vectorRank, lexicalRank: top.lexicalRank, rrfScore: top.rrfScore, rerankScore: top.rerankScore ?? null }
      : null,
  };
}

/**
 * The review pipeline for one batch of clauses: embed (if needed) -> hybrid retrieval + selective
 * rerank -> pre-filter clauses that match no rule -> one batched LLM call -> citation validation.
 * Persistence is the caller's job, so the review job and the eval share exactly this code.
 */
export async function assessClauses<C extends ClauseInput>(batch: C[]): Promise<AssessResult<C>> {
  const unembedded = batch.filter((c) => !c.embedding);
  if (unembedded.length) {
    const vecs = await embedTexts(unembedded.map((c) => c.text), "RETRIEVAL_QUERY");
    unembedded.forEach((c, i) => (c.embedding = vecs[i]));
  }

  const retrieved: { clause: C; res: RetrievalResult }[] = [];
  for (const c of batch) {
    const res = await maybeRerank(c, await retrieveForClause({ text: c.text, embedding: c.embedding! }));
    retrieved.push({ clause: c, res });
  }
  const matched = retrieved.filter((r) => r.res.relevant && r.res.candidates.length > 0);

  const ruleIds = [...new Set(matched.map((r) => r.res.candidates[0].ruleId))];
  const ruleRows = ruleIds.length ? await getDb().select().from(playbookRules).where(inArray(playbookRules.id, ruleIds)) : [];
  const ruleById = new Map(ruleRows.map((r) => [r.id, r]));

  const items: (ReviewItem & { ruleId: string })[] = matched.map((r, i) => {
    const rule = ruleById.get(r.res.candidates[0].ruleId)!;
    return {
      id: `c${i + 1}`,
      clauseRef: r.clause.clauseRef,
      text: r.clause.text,
      ruleId: rule.id,
      rule: { key: rule.ruleKey, name: rule.ruleName, text: rule.ruleText, preferred: rule.preferredPosition, fallback: rule.fallbackPosition },
    };
  });

  const llm = items.length ? await reviewBatch(items, getProviderChain()) : null;
  const byId = new Map(llm?.assessments.map((a) => [a.clause_id, a]));

  const assessed = retrieved.map((r): AssessedClause<C> => {
    const base = { clause: r.clause, retrieval: r.res, retrievalDebug: debugFor(r.res) };
    const i = matched.indexOf(r);
    if (i < 0) return base;
    const item = items[i];
    return { ...base, match: { ruleId: item.ruleId, ruleKey: item.rule.key, draft: finalizeAssessment(byId.get(item.id)!, r.clause.text, item.rule.key) } };
  });
  return { assessed, modelUsed: llm?.modelUsed ?? null, attempts: llm?.attempts ?? [] };
}

/** Playbook rules that no assessed clause satisfied: the "missing clause" findings. */
export function uncoveredRuleKeys(allRuleKeys: string[], coveredKeys: Iterable<string>): string[] {
  const covered = new Set(coveredKeys);
  return allRuleKeys.filter((k) => !covered.has(k));
}

/** Wording of a "missing clause" finding; shared by the live job and the saved demo review. */
export const missingClauseReason = (ruleName: string, ruleText: string) =>
  `Missing clause: nothing in this document addresses "${ruleName}". ${ruleText}`;

import { and, eq, or } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { clauses, documents, findings, playbookRules, reviews } from "@/lib/db/schema";
import { SAMPLE_FILENAME } from "@/lib/ingest/store";
import { playbookOwner, ruleScope } from "@/lib/playbook/owner";
import { loadDemoSnapshot, planCachedFindings } from "./cached";
import { ReviewError } from "./job";

/**
 * Replace a failed review's findings with the saved demo review. Strictly limited to the bundled sample
 * document and to reviews that have actually errored, so it can't be used to skip the model for real uploads.
 */
export async function applyCachedReview(reviewId: string, userId: string) {
  const db = getDb();
  const [row] = await db
    .select({ review: reviews, filename: documents.filename })
    .from(reviews)
    .innerJoin(documents, eq(documents.id, reviews.documentId))
    .where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)));
  if (!row) throw new ReviewError(404, "review not found");
  const { review } = row;
  if (review.status === "completed") return;
  if (row.filename !== SAMPLE_FILENAME) throw new ReviewError(409, "a saved review exists only for the sample contract");
  if (!review.error) throw new ReviewError(409, "the live review has not failed");

  const snapshot = loadDemoSnapshot();
  if (!snapshot) throw new ReviewError(503, "no saved demo review is available");
  const stored = await db
    .select({ id: clauses.id, textHash: clauses.textHash })
    .from(clauses)
    .where(eq(clauses.documentId, review.documentId));
  const planned = planCachedFindings(snapshot, stored);
  if (!planned) throw new ReviewError(503, "the saved demo review is out of date for this contract");

  const keys = [...new Set(planned.map((f) => f.ruleKey).filter((k): k is string => !!k))];
  const rules = keys.length ? await db.select().from(playbookRules).where(and(ruleScope(await playbookOwner(userId)), or(...keys.map((k) => eq(playbookRules.ruleKey, k))))) : [];
  const ruleId = new Map(rules.map((r) => [r.ruleKey, r.id]));

  await db.delete(findings).where(eq(findings.reviewId, reviewId));
  await db.insert(findings).values(
    planned.map((f) => ({
      reviewId,
      clauseId: f.clauseId,
      playbookRuleId: f.ruleKey ? (ruleId.get(f.ruleKey) ?? null) : null,
      riskLevel: f.riskLevel,
      deviationReason: f.deviationReason,
      sourceSpan: f.sourceSpan,
      confidence: f.confidence,
      citationVerified: f.citationVerified,
      retrievalDebug: f.retrievalDebug,
      modelUsed: f.modelUsed,
    })),
  );
  const done = planned.filter((f) => f.clauseId).length;
  await db
    .update(reviews)
    .set({ status: "completed", progress: done, totalClauses: done, cached: true, error: null, claimedAt: null })
    .where(eq(reviews.id, reviewId));
}


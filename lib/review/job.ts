import { and, asc, desc, eq, gte, inArray, isNull, lt, notExists, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { clauses, documentFiles, documents, findings, playbookRules, reviews } from "@/lib/db/schema";
import { embedTexts } from "@/lib/embed";
import { getEnv } from "@/lib/env";
import { getProviderChain } from "@/lib/llm/providers";
import { reviewBatch, type ReviewItem } from "@/lib/llm/review";
import { retrieveForClause, type RetrievalResult } from "@/lib/retrieval/hybrid";
import { maybeRerank } from "@/lib/retrieval/rerank";
import { finalizeAssessment } from "./finalize";

export const BATCH_SIZE = 8;

export class ReviewError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Reviews that count toward the daily cap. A review that failed outright (error recorded, no findings
 * produced) never got a successful LLM batch, so it doesn't use up the user's allowance.
 */
async function reviewsInLast24h(userId: string) {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const [{ n }] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(reviews)
    .where(
      and(
        eq(reviews.userId, userId),
        gte(reviews.startedAt, since),
        sql`not (${reviews.error} is not null and not exists (select 1 from ${findings} where ${findings.reviewId} = ${reviews.id}))`,
      ),
    );
  return n;
}

/** For the "N reviews left today" indicator. */
export async function reviewsLeftToday(userId: string) {
  const limit = getEnv().DAILY_REVIEW_LIMIT;
  return { left: Math.max(0, limit - (await reviewsInLast24h(userId))), limit };
}

export function assertUnderDailyLimit(count: number, limit: number) {
  if (count >= limit) throw new ReviewError(429, `daily review limit reached (${limit} per 24h)`);
}

export async function createReview(userId: string, documentId: string) {
  const db = getDb();
  const [doc] = await db.select().from(documents).where(and(eq(documents.id, documentId), eq(documents.userId, userId)));
  if (!doc) throw new ReviewError(404, "document not found");

  const limit = getEnv().DAILY_REVIEW_LIMIT;
  const n = await reviewsInLast24h(userId);
  assertUnderDailyLimit(n, limit);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(clauses)
    .where(eq(clauses.documentId, documentId));
  if (total === 0) throw new ReviewError(422, "document has no clauses to review");

  const [row] = await db
    .insert(reviews)
    .values({ userId, documentId, totalClauses: total, status: "pending" })
    .returning({ id: reviews.id });
  return row.id;
}

/** Most recent reviews for the landing page. */
export async function recentReviews(userId: string, limit = 8) {
  return getDb()
    .select({
      id: reviews.id,
      status: reviews.status,
      startedAt: reviews.startedAt,
      totalClauses: reviews.totalClauses,
      filename: documents.filename,
    })
    .from(reviews)
    .innerJoin(documents, eq(documents.id, reviews.documentId))
    .where(eq(reviews.userId, userId))
    .orderBy(desc(reviews.startedAt))
    .limit(limit);
}

/** Review state + findings, scoped to the owner. */
export async function getReviewState(reviewId: string, userId: string) {
  const db = getDb();
  const [review] = await db.select().from(reviews).where(and(eq(reviews.id, reviewId), eq(reviews.userId, userId)));
  if (!review) throw new ReviewError(404, "review not found");
  const rows = await db
    .select({
      id: findings.id,
      clauseId: findings.clauseId,
      clauseRef: clauses.clauseRef,
      clauseText: clauses.text,
      pageNumber: clauses.pageNumber,
      bbox: clauses.bboxJson,
      ruleKey: playbookRules.ruleKey,
      ruleName: playbookRules.ruleName,
      riskLevel: findings.riskLevel,
      deviationReason: findings.deviationReason,
      sourceSpan: findings.sourceSpan,
      confidence: findings.confidence,
      citationVerified: findings.citationVerified,
      retrievalDebug: findings.retrievalDebug,
      modelUsed: findings.modelUsed,
    })
    .from(findings)
    .leftJoin(clauses, eq(findings.clauseId, clauses.id))
    .leftJoin(playbookRules, eq(findings.playbookRuleId, playbookRules.id))
    .where(eq(findings.reviewId, reviewId))
    .orderBy(asc(clauses.charStart));
  const progress = rows.filter((r) => r.clauseId).length;
  const [document] = await db
    .select({
      id: documents.id,
      filename: documents.filename,
      pageCount: documents.pageCount,
      // Documents ingested before originals were stored have no file to render.
      hasFile: sql<boolean>`exists (select 1 from ${documentFiles} where ${documentFiles.documentId} = ${documents.id})`,
    })
    .from(documents)
    .where(eq(documents.id, review.documentId));
  return { review: { ...review, progress }, document, findings: rows };
}

/** Longer than the route's maxDuration (300s), so a lease only expires once its worker is truly gone. */
export const LEASE_SECONDS = 330;

/**
 * Process the next batch of clauses. Each call is short (one retrieval pass + one LLM call), so a
 * whole review never sits inside a single serverless invocation. The batch is "the first clauses
 * with no finding yet", so progress is derived from the findings themselves and a crashed call
 * simply gets redone. A lease (claimed_at) keeps concurrent calls from double-processing; it
 * expires so a dead worker can't strand the review.
 */
export async function advanceReview(reviewId: string, userId: string) {
  const db = getDb();
  const { review } = await getReviewState(reviewId, userId);
  if (review.status === "completed" || review.status === "failed") return;

  const lease = await db
    .update(reviews)
    .set({ status: "running", claimedAt: new Date() })
    .where(
      and(
        eq(reviews.id, reviewId),
        inArray(reviews.status, ["pending", "running"]),
        or(isNull(reviews.claimedAt), lt(reviews.claimedAt, new Date(Date.now() - LEASE_SECONDS * 1000))),
      ),
    )
    .returning({ id: reviews.id });
  if (lease.length === 0) return; // another call is working on it

  try {
    const batch = await db
      .select()
      .from(clauses)
      .where(
        and(
          eq(clauses.documentId, review.documentId),
          notExists(
            db
              .select({ one: sql`1` })
              .from(findings)
              .where(and(eq(findings.reviewId, reviewId), eq(findings.clauseId, clauses.id))),
          ),
        ),
      )
      .orderBy(asc(clauses.charStart))
      .limit(BATCH_SIZE);
    if (batch.length) await processBatch(reviewId, batch);
    await db.update(reviews).set({ error: null }).where(eq(reviews.id, reviewId));
    await completeIfDone(reviewId, review.totalClauses);
  } catch (e) {
    await db
      .update(reviews)
      .set({ error: (e instanceof Error ? e.message : String(e)).slice(0, 500) })
      .where(eq(reviews.id, reviewId));
    throw e;
  } finally {
    await db.update(reviews).set({ claimedAt: null }).where(eq(reviews.id, reviewId));
  }
}

type ClauseRow = typeof clauses.$inferSelect;

async function processBatch(reviewId: string, batch: ClauseRow[]) {
  const db = getDb();

  // Embed any clause that was stored without a vector.
  const unembedded = batch.filter((c) => !c.embedding);
  if (unembedded.length) {
    const vecs = await embedTexts(unembedded.map((c) => c.text), "RETRIEVAL_QUERY");
    unembedded.forEach((c, i) => (c.embedding = vecs[i]));
  }

  // Retrieval: pre-filter clauses that match no rule so they never reach the LLM.
  const retrieved: { clause: ClauseRow; res: RetrievalResult }[] = [];
  for (const c of batch) {
    const res = await maybeRerank(c, await retrieveForClause({ text: c.text, embedding: c.embedding! }));
    retrieved.push({ clause: c, res });
  }
  const matched = retrieved.filter((r) => r.res.relevant && r.res.candidates.length > 0);

  const ruleIds = [...new Set(matched.map((r) => r.res.candidates[0].ruleId))];
  const ruleRows = ruleIds.length
    ? await db.select().from(playbookRules).where(inArray(playbookRules.id, ruleIds))
    : [];
  const ruleById = new Map(ruleRows.map((r) => [r.id, r]));

  const items: (ReviewItem & { clause: ClauseRow; ruleId: string })[] = matched.map((r, i) => {
    const rule = ruleById.get(r.res.candidates[0].ruleId)!;
    return {
      id: `c${i + 1}`,
      clauseRef: r.clause.clauseRef,
      text: r.clause.text,
      clause: r.clause,
      ruleId: rule.id,
      rule: {
        key: rule.ruleKey,
        name: rule.ruleName,
        text: rule.ruleText,
        preferred: rule.preferredPosition,
        fallback: rule.fallbackPosition,
      },
    };
  });

  const debugFor = (r: (typeof retrieved)[number]) => {
    const top = r.res.candidates[0];
    return {
      relevant: r.res.relevant,
      margin: r.res.margin,
      topSimilarity: r.res.topSimilarity,
      reranked: r.res.reranked,
      rerankWanted: r.res.rerankWanted,
      topRule: top
        ? { key: top.ruleKey, vectorRank: top.vectorRank, lexicalRank: top.lexicalRank, rrfScore: top.rrfScore, rerankScore: top.rerankScore ?? null }
        : null,
    };
  };

  const rows: (typeof findings.$inferInsert)[] = retrieved
    .filter((r) => !matched.includes(r))
    .map((r) => ({
      reviewId,
      clauseId: r.clause.id,
      riskLevel: "none" as const,
      deviationReason: "No matching playbook rule",
      confidence: "high" as const,
      citationVerified: true,
      retrievalDebug: debugFor(r),
      modelUsed: null,
    }));

  if (items.length) {
    const result = await reviewBatch(items, getProviderChain());
    await db
      .update(reviews)
      .set({ providerLog: sql`coalesce(${reviews.providerLog}, '[]'::jsonb) || ${JSON.stringify([{ at: new Date().toISOString(), modelUsed: result.modelUsed, attempts: result.attempts }])}::jsonb` })
      .where(eq(reviews.id, reviewId));
    const byId = new Map(result.assessments.map((a) => [a.clause_id, a]));
    for (const [i, item] of items.entries()) {
      const draft = finalizeAssessment(byId.get(item.id)!, item.clause.text, item.rule.key);
      rows.push({
        reviewId,
        clauseId: item.clause.id,
        playbookRuleId: draft.playbookRuleKey ? item.ruleId : null,
        riskLevel: draft.riskLevel,
        deviationReason: draft.deviationReason,
        sourceSpan: draft.sourceSpan,
        confidence: draft.confidence,
        citationVerified: draft.citationVerified,
        retrievalDebug: debugFor(matched[i]),
        modelUsed: result.modelUsed,
      });
    }
  }
  if (rows.length) await db.insert(findings).values(rows);
}

/**
 * Once every clause has a finding, mark the review completed and add "missing clause" findings for
 * playbook rules that no clause satisfied. The status flip is the idempotency guard.
 */
async function completeIfDone(reviewId: string, total: number) {
  const db = getDb();
  const [{ done }] = await db
    .select({ done: sql<number>`count(*)::int` })
    .from(findings)
    .where(and(eq(findings.reviewId, reviewId), sql`${findings.clauseId} is not null`));
  if (done < total) return;

  const flipped = await db
    .update(reviews)
    .set({ status: "completed", progress: total })
    .where(and(eq(reviews.id, reviewId), inArray(reviews.status, ["pending", "running"])))
    .returning({ id: reviews.id });
  if (flipped.length === 0) return;

  const covered = new Set(
    (
      await db
        .select({ id: findings.playbookRuleId })
        .from(findings)
        .where(and(eq(findings.reviewId, reviewId), sql`${findings.playbookRuleId} is not null`))
    ).map((r) => r.id),
  );
  const missing = (await db.select().from(playbookRules)).filter((r) => !covered.has(r.id));
  if (missing.length) {
    await db.insert(findings).values(
      missing.map((r) => ({
        reviewId,
        clauseId: null,
        playbookRuleId: r.id,
        riskLevel: "medium" as const,
        deviationReason: `Missing clause: nothing in this document addresses "${r.ruleName}". ${r.ruleText}`,
        confidence: "medium" as const,
        citationVerified: true,
        retrievalDebug: { missingClause: true },
        modelUsed: null,
      })),
    );
  }
}

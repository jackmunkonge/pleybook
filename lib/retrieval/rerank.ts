import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { rerankCache } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { rrf } from "./fusion";
import type { RetrievalResult } from "./hybrid";

const RERANK_MODEL = "rerank-v3.5";
const RATE_LIMIT_RETRIES = 3;
const sha = (s: string) => createHash("sha256").update(s.replace(/\s+/g, " ").trim()).digest("hex");

/**
 * Selective Cohere rerank. Only runs when retrieval asked for it; results are cached by
 * (clause hash, rule hash). Any failure (no key, 429, network) leaves the RRF order untouched
 * and reports reranked:false instead of throwing.
 */
export async function maybeRerank(
  clause: { text: string; textHash: string },
  result: RetrievalResult,
): Promise<RetrievalResult> {
  if (!result.rerankWanted) return result;
  try {
    const db = getDb();
    const ruleHash = new Map(result.candidates.map((c) => [c.ruleId, sha(`${c.ruleName}. ${c.ruleText}`)]));
    const cached = await db
      .select()
      .from(rerankCache)
      .where(and(eq(rerankCache.clauseHash, clause.textHash), inArray(rerankCache.ruleHash, [...ruleHash.values()])));
    const scoreByHash = new Map(cached.map((r) => [r.ruleHash, r.score]));

    const missing = result.candidates.filter((c) => !scoreByHash.has(ruleHash.get(c.ruleId)!));
    if (missing.length) {
      const key = getEnv().COHERE_API_KEY;
      if (!key) return result;
      const body = JSON.stringify({
        model: RERANK_MODEL,
        query: clause.text,
        documents: result.candidates.map((c) => `${c.ruleName}. ${c.ruleText}`),
        top_n: result.candidates.length,
      });
      let res: Response | undefined;
      // Trial keys are limited to a few calls per minute: back off and retry on 429 before giving up.
      for (let attempt = 0; attempt <= RATE_LIMIT_RETRIES; attempt++) {
        res = await fetch("https://api.cohere.com/v2/rerank", {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          body,
        });
        if (res.status !== 429 || attempt === RATE_LIMIT_RETRIES) break;
        await new Promise((r) => setTimeout(r, 8000 * (attempt + 1)));
      }
      if (!res?.ok) return result; // quota / outage: skip gracefully
      const json = (await res.json()) as { results: { index: number; relevance_score: number }[] };
      const rows = json.results.map((r) => ({
        clauseHash: clause.textHash,
        ruleHash: ruleHash.get(result.candidates[r.index].ruleId)!,
        score: r.relevance_score,
      }));
      if (rows.length) await db.insert(rerankCache).values(rows).onConflictDoNothing();
      for (const r of rows) scoreByHash.set(r.ruleHash, r.score);
    }

    const scored = result.candidates.map((c) => ({ ...c, rerankScore: scoreByHash.get(ruleHash.get(c.ruleId)!) }));
    // The reranker is a third voter, not an override: on the sample MSA it alone flipped correct
    // first-pass answers (e.g. "unlimited liability" -> IP indemnity). Fuse its order with the RRF order.
    const rerankOrder = [...scored].sort((a, b) => (b.rerankScore ?? -1) - (a.rerankScore ?? -1)).map((c) => c.ruleId);
    const blended = new Map(rrf([result.candidates.map((c) => c.ruleId), rerankOrder]).map((f, i) => [f.id, i]));
    const candidates = scored.sort((a, b) => blended.get(a.ruleId)! - blended.get(b.ruleId)!);
    return { ...result, candidates, reranked: true };
  } catch {
    return result;
  }
}

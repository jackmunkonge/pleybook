import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { isRelevant, keyTermsQuery, margin, needsRerank, rrf, tokenCount } from "./fusion";

export type Candidate = {
  ruleId: string;
  ruleKey: string;
  ruleName: string;
  ruleText: string;
  vectorRank: number | null;
  lexicalRank: number | null;
  vectorSimilarity: number | null;
  rrfScore: number;
  rerankScore?: number;
};

export type RetrievalResult = {
  candidates: Candidate[]; // best first
  margin: number;
  relevant: boolean;
  topSimilarity: number | null;
  rerankWanted: boolean;
  reranked: boolean;
};

const TOP_N = 5;

type VecRow = { rule_id: string; sim: number };
type LexRow = { rule_id: string; score: number };

/** Rules and their paraphrases share one pool; every row maps back to a rule_id. `owner` null = the shared default playbook. */
const pool = (owner: string | null) => sql`(
  SELECT r.id AS rule_id, r.embedding, r.tsv FROM playbook_rules r WHERE r.user_id IS NOT DISTINCT FROM ${owner}
  UNION ALL
  SELECT v.rule_id, v.embedding, v.tsv FROM rule_variants v
  JOIN playbook_rules r ON r.id = v.rule_id AND r.user_id IS NOT DISTINCT FROM ${owner}
) pool`;

export async function retrieveForClause(clause: { text: string; embedding: number[] }, owner: string | null = null): Promise<RetrievalResult> {
  const POOL = pool(owner);
  const db = getDb();
  const vec = `[${clause.embedding.join(",")}]`;
  const terms = keyTermsQuery(clause.text);

  const vecRes = await db.execute(sql`
    SELECT rule_id, MAX(1 - (embedding <=> ${vec}::vector)) AS sim
    FROM ${POOL}
    WHERE embedding IS NOT NULL
    GROUP BY rule_id
    ORDER BY sim DESC
    LIMIT ${TOP_N}`);
  const vecRows = vecRes.rows as VecRow[];

  const lexRows = terms
    ? ((
        await db.execute(sql`
    SELECT rule_id, MAX(ts_rank_cd(tsv, to_tsquery('english', ${terms}))) AS score
    FROM ${POOL}
    WHERE tsv @@ to_tsquery('english', ${terms})
    GROUP BY rule_id
    ORDER BY score DESC
    LIMIT ${TOP_N}`)
      ).rows as LexRow[])
    : [];

  const fused = rrf([vecRows.map((r) => r.rule_id), lexRows.map((r) => r.rule_id)]);
  const simById = new Map(vecRows.map((r) => [r.rule_id, Number(r.sim)]));
  const ids = fused.map((f) => f.id);
  if (ids.length === 0) {
    return { candidates: [], margin: 0, relevant: false, topSimilarity: null, rerankWanted: false, reranked: false };
  }

  const ruleRes = await db.execute(sql`
    SELECT id, rule_key, rule_name, rule_text FROM playbook_rules
    WHERE id IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
  const rules = new Map(
    (ruleRes.rows as { id: string; rule_key: string; rule_name: string; rule_text: string }[]).map((r) => [r.id, r]),
  );

  const candidates: Candidate[] = fused.map((f) => {
    const r = rules.get(f.id)!;
    return {
      ruleId: f.id,
      ruleKey: r.rule_key,
      ruleName: r.rule_name,
      ruleText: r.rule_text,
      vectorRank: f.ranks[0],
      lexicalRank: f.ranks[1],
      vectorSimilarity: simById.get(f.id) ?? null,
      rrfScore: f.score,
    };
  });

  const topSimilarity = vecRows.length ? Number(vecRows[0].sim) : null;
  const m = margin(fused.map((f) => f.score));
  const retrieversAgree = candidates[0].vectorRank === 1 && candidates[0].lexicalRank === 1;
  const relevant = isRelevant(topSimilarity, retrieversAgree);
  const rerankWanted = needsRerank({ margin: m, tokens: tokenCount(clause.text), relevant, candidates: candidates.length });
  return { candidates, margin: m, relevant, topSimilarity, rerankWanted, reranked: false };
}

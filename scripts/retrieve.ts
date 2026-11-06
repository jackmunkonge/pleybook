// Usage: tsx scripts/retrieve.ts <document-id | "clause text">
// Debug CLI: for each clause in a stored document (or one ad-hoc text), print the top rules with scores.
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const arg = process.argv[2];
  if (!arg) throw new Error('Usage: tsx scripts/retrieve.ts <document-id | "clause text">');
  const { getDb } = await import("../lib/db/client");
  const { clauses, playbookRules } = await import("../lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { embedTexts } = await import("../lib/embed");
  const { retrieveForClause } = await import("../lib/retrieval/hybrid");
  const { maybeRerank } = await import("../lib/retrieval/rerank");
  const { uncoveredRules } = await import("../lib/retrieval/fusion");
  const { createHash } = await import("node:crypto");
  const db = getDb();

  const isUuid = /^[0-9a-f-]{36}$/i.test(arg);
  const items = isUuid
    ? (await db.select().from(clauses).where(eq(clauses.documentId, arg))).map((c) => ({
        ref: c.clauseRef ?? "-",
        text: c.text,
        textHash: c.textHash,
        embedding: c.embedding,
      }))
    : [{ ref: "adhoc", text: arg, textHash: createHash("sha256").update(arg).digest("hex"), embedding: null as number[] | null }];

  const missing = items.filter((i) => !i.embedding);
  if (missing.length) {
    const vecs = await embedTexts(missing.map((m) => m.text), "RETRIEVAL_QUERY");
    missing.forEach((m, i) => (m.embedding = vecs[i]));
  }

  const tops: (string | null)[] = [];
  for (const it of items) {
    const res = await maybeRerank(it, await retrieveForClause({ text: it.text, embedding: it.embedding! }));
    tops.push(res.relevant ? (res.candidates[0]?.ruleKey ?? null) : null);
    console.log(
      `\n[${it.ref}] ${it.text.replace(/\s+/g, " ").slice(0, 90)}…\n  sim=${res.topSimilarity?.toFixed(3) ?? "-"} margin=${res.margin.toFixed(3)} relevant=${res.relevant} reranked=${res.reranked}`,
    );
    for (const c of res.candidates.slice(0, 3)) {
      console.log(
        `  ${c.ruleKey.padEnd(24)} rrf=${c.rrfScore.toFixed(4)} vec#${c.vectorRank ?? "-"} lex#${c.lexicalRank ?? "-"} sim=${c.vectorSimilarity?.toFixed(3) ?? "-"}${c.rerankScore !== undefined ? ` rerank=${c.rerankScore.toFixed(3)}` : ""}`,
      );
    }
  }
  if (isUuid) {
    const all = (await db.select({ k: playbookRules.ruleKey }).from(playbookRules)).map((r) => r.k);
    console.log(`\nRules with no matching clause: ${uncoveredRules(all, tops).join(", ") || "(none)"}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

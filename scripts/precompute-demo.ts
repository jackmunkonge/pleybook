// Usage: tsx scripts/precompute-demo.ts
// Runs the bundled sample MSA through the live pipeline once and saves the result (findings plus clause
// embeddings) to data/demo/sample-msa-review.json. The app serves that snapshot, with a "cached" badge,
// when live providers fail, and uses its embeddings so the sample can be ingested with no provider at all.
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";
import path from "node:path";
import type { DemoFinding, DemoSnapshot } from "../lib/review/cached";

const round = (v: number[]) => v.map((x) => Number(x.toFixed(6)));

async function main() {
  const { getDb } = await import("../lib/db/client");
  const { playbookRules } = await import("../lib/db/schema");
  const { DEFAULT_EMBED_MODEL, embedTexts } = await import("../lib/embed");
  const { getEnv } = await import("../lib/env");
  const { ingestBuffer } = await import("../lib/ingest");
  const { SAMPLE_FILENAME } = await import("../lib/ingest/store");
  const { withChainRetry } = await import("../lib/eval/run");
  const { assessClauses, missingClauseReason } = await import("../lib/review/assess");
  const { BATCH_SIZE } = await import("../lib/review/job");

  const env = getEnv();
  const bytes = fs.readFileSync(path.join(process.cwd(), "data/contracts", SAMPLE_FILENAME));
  const ingested = await ingestBuffer(new Uint8Array(bytes), SAMPLE_FILENAME);
  console.log(`${ingested.clauses.length} clauses`);

  const vectors = await embedTexts(ingested.clauses.map((c) => c.text), "RETRIEVAL_QUERY");
  const inputs = ingested.clauses.map((c, i) => ({ clauseRef: c.clauseRef, text: c.text, textHash: c.textHash, embedding: vectors[i] as number[] | null }));

  const findings: DemoFinding[] = [];
  const covered = new Set<string>();
  for (let i = 0; i < inputs.length; i += BATCH_SIZE) {
    console.log(`  batch ${i / BATCH_SIZE + 1}/${Math.ceil(inputs.length / BATCH_SIZE)}`);
    const { assessed, modelUsed } = await withChainRetry(() => assessClauses(inputs.slice(i, i + BATCH_SIZE)));
    for (const a of assessed) {
      const m = a.match;
      if (m?.draft.playbookRuleKey) covered.add(m.draft.playbookRuleKey);
      findings.push(
        m
          ? { textHash: a.clause.textHash, ruleKey: m.draft.playbookRuleKey, riskLevel: m.draft.riskLevel, deviationReason: m.draft.deviationReason, sourceSpan: m.draft.sourceSpan, confidence: m.draft.confidence, citationVerified: m.draft.citationVerified, retrievalDebug: a.retrievalDebug, modelUsed }
          : { textHash: a.clause.textHash, ruleKey: null, riskLevel: "none", deviationReason: "No matching playbook rule", sourceSpan: null, confidence: "high", citationVerified: true, retrievalDebug: a.retrievalDebug, modelUsed: null },
      );
    }
  }
  for (const r of (await getDb().select().from(playbookRules)).filter((r) => !covered.has(r.ruleKey))) {
    findings.push({ textHash: null, ruleKey: r.ruleKey, riskLevel: "medium", deviationReason: missingClauseReason(r.ruleName, r.ruleText), sourceSpan: null, confidence: "medium", citationVerified: true, retrievalDebug: { missingClause: true }, modelUsed: null });
  }

  const snapshot: DemoSnapshot = {
    version: 1,
    createdAt: new Date().toISOString(),
    filename: SAMPLE_FILENAME,
    embedModel: env.EMBED_MODEL || DEFAULT_EMBED_MODEL,
    embedDim: env.EMBED_DIM,
    clauses: inputs.map((c) => ({ clauseRef: c.clauseRef, textHash: c.textHash, embedding: round(c.embedding!) })),
    findings,
  };
  const out = path.join(process.cwd(), "data/demo/sample-msa-review.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(snapshot));

  const ref = new Map(inputs.map((c) => [c.textHash, c.clauseRef ?? "-"]));
  for (const f of findings) {
    console.log(`${(f.textHash ? ref.get(f.textHash)! : "MISSING").padEnd(8)} ${f.riskLevel.padEnd(6)} ${(f.ruleKey ?? "-").padEnd(24)} ${f.confidence}${f.citationVerified ? "" : " UNVERIFIED"} [${f.modelUsed ?? "no-llm"}]`);
  }
  console.log(`\nwrote ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

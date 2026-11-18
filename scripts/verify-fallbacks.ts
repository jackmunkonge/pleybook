// Usage: tsx scripts/verify-fallbacks.ts <model-fallback|all-down> --user <username>
// Breaks providers on purpose and checks the app degrades the way it promises.
//   model-fallback: the primary model ID is bogus -> the next provider must answer.
//   all-down:       every provider key is invalid -> the sample must still ingest (saved embeddings),
//                   the live review must fail, and the saved review must complete it, marked "cached".
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";
import path from "node:path";

const scenario = process.argv[2];
const ui = process.argv.indexOf("--user");
const username = ui >= 0 ? process.argv[ui + 1] : undefined;
let failed = 0;
const check = (ok: boolean, label: string, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${extra ? `  (${extra})` : ""}`);
  if (!ok) failed++;
};

async function modelFallback() {
  process.env.PRIMARY_MODEL = "gemini-model-that-does-not-exist";
  const { getProviderChain } = await import("../lib/llm/providers");
  const { reviewBatch } = await import("../lib/llm/review");
  const chain = getProviderChain();
  check(chain.length >= 2, "at least two providers are configured", chain.map((c) => c.name).join(" -> "));
  const { modelUsed, attempts, assessments } = await reviewBatch(
    [{
      id: "c1", clauseRef: "3.1", text: "The Customer shall pay each invoice within seven (7) days of the invoice date.",
      rule: { key: "payment-terms", name: "Payment terms", text: "Net 45 payment terms.", preferred: "Net 45", fallback: "Net 30" },
    }],
    chain,
  );
  check(attempts[0]?.provider === "gemini" && !attempts[0].ok, "the bogus primary model fails", attempts[0]?.error?.slice(0, 80));
  check(!modelUsed.startsWith("gemini:"), "a later provider answers instead", modelUsed);
  check(assessments.length === 1, "the answer is a valid structured assessment");
}

async function allDown() {
  if (!username) throw new Error("--user <username> is required");
  for (const k of ["GOOGLE_GENERATIVE_AI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "COHERE_API_KEY"]) process.env[k] = "invalid-key-for-test";

  const { eq } = await import("drizzle-orm");
  const { getDb } = await import("../lib/db/client");
  const { documents, user } = await import("../lib/db/schema");
  const { getEnv } = await import("../lib/env");
  const { DEFAULT_EMBED_MODEL } = await import("../lib/embed");
  const { SAMPLE_FILENAME, storeDocument } = await import("../lib/ingest/store");
  const { loadDemoSnapshot, snapshotVectors } = await import("../lib/review/cached");
  const { applyCachedReview } = await import("../lib/review/cached-apply");
  const { advanceReview, createReview, getReviewState } = await import("../lib/review/job");

  const snapshot = loadDemoSnapshot();
  check(!!snapshot, "a saved demo review exists (npm run demo:precompute)");
  if (!snapshot) return;

  const [u] = await getDb().select({ id: user.id }).from(user).where(eq(user.username, username.toLowerCase()));
  if (!u) throw new Error(`No such user: ${username}`);

  const env = getEnv();
  const vectors = snapshotVectors(snapshot, env.EMBED_MODEL || DEFAULT_EMBED_MODEL, env.EMBED_DIM);
  check(vectors.size === snapshot.clauses.length, "saved embeddings match the configured embedding model", `${vectors.size} vectors`);

  let docId: string | undefined;
  try {
    const bytes = fs.readFileSync(path.join(process.cwd(), "data/contracts", SAMPLE_FILENAME));
    const doc = await storeDocument(u.id, SAMPLE_FILENAME, new Uint8Array(bytes), vectors);
    docId = doc.id;
    check(true, "the sample ingests with every provider key invalid", `${doc.clauses} clauses`);

    const reviewId = await createReview(u.id, doc.id);
    const live = await advanceReview(reviewId, u.id).then(() => null, (e: Error) => e);
    check(!!live, "the live review fails when all providers are down", live?.message.slice(0, 90));
    const failedState = await getReviewState(reviewId, u.id);
    check(!!failedState.review.error && failedState.review.status !== "completed", "the failure is recorded on the review");

    await applyCachedReview(reviewId, u.id);
    const { review, findings } = await getReviewState(reviewId, u.id);
    check(review.status === "completed" && review.cached, "the saved review completes it and marks it cached");
    check(findings.length === snapshot.findings.length, "every saved finding is present", `${findings.length}`);
    check(findings.every((f) => f.clauseId === null || f.clauseText), "findings are attached to this document's clauses");
    check(findings.some((f) => f.ruleKey), "findings link to playbook rules");
  } finally {
    if (docId) await getDb().delete(documents).where(eq(documents.id, docId)); // cascades to clauses, reviews, findings
  }
}

async function main() {
  if (scenario === "model-fallback") await modelFallback();
  else if (scenario === "all-down") await allDown();
  else throw new Error("Usage: tsx scripts/verify-fallbacks.ts <model-fallback|all-down> --user <username>");
  console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

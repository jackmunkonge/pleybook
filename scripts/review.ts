// Usage: tsx scripts/review.ts <document-id> --user <username>
// Drives a whole review through the same job code the API uses, printing progress and findings.
import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const args = process.argv.slice(2);
  const ui = args.indexOf("--user");
  const username = ui >= 0 ? args[ui + 1] : undefined;
  const documentId = args.find((a, i) => !a.startsWith("--") && i !== ui + 1);
  if (!documentId || !username) throw new Error("Usage: tsx scripts/review.ts <document-id> --user <username>");

  const { getDb } = await import("../lib/db/client");
  const { user } = await import("../lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { createReview, advanceReview, getReviewState } = await import("../lib/review/job");
  const [u] = await getDb().select({ id: user.id }).from(user).where(eq(user.username, username.toLowerCase()));
  if (!u) throw new Error(`No such user: ${username}`);

  const id = await createReview(u.id, documentId);
  console.log(`review ${id}`);
  for (;;) {
    await advanceReview(id, u.id);
    const { review } = await getReviewState(id, u.id);
    console.log(`  ${review.status} ${review.progress}/${review.totalClauses}`);
    if (review.status === "completed") break;
  }
  const { review, findings } = await getReviewState(id, u.id);
  for (const f of findings) {
    console.log(`${(f.clauseRef ?? (f.clauseId ? "(none)" : "MISSING")).padEnd(8)} ${f.riskLevel.padEnd(6)} ${(f.ruleKey ?? "-").padEnd(24)} ${f.confidence}${f.citationVerified ? "" : " UNVERIFIED"} [${f.modelUsed ?? "no-llm"}]`);
  }
  console.log(`\nprovider log: ${JSON.stringify(review.providerLog)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

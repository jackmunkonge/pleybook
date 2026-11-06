// Usage: tsx scripts/ingest.ts <file.pdf|docx> [--user <username>]
// Without --user: dry run, prints the clause table. With --user: writes documents + clauses (embeddings null).
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";
import path from "node:path";

async function main() {
  const args = process.argv.slice(2);
  const userIdx = args.indexOf("--user");
  const username = userIdx >= 0 ? args[userIdx + 1] : undefined;
  const file = args.find((a, i) => !a.startsWith("--") && (userIdx < 0 || i !== userIdx + 1));
  if (!file) throw new Error("Usage: tsx scripts/ingest.ts <file.pdf|docx> [--user <username>]");

  const { ingestBuffer } = await import("../lib/ingest");
  const result = await ingestBuffer(fs.readFileSync(file), path.basename(file));

  console.log(`${path.basename(file)}: ${result.clauses.length} clauses, ${result.pageCount ?? "?"} pages`);
  console.log("ref\tpage\tbbox\tlen\tpath");
  for (const c of result.clauses) {
    console.log(
      [c.clauseRef ?? "-", c.pageNumber ?? "-", c.bboxJson?.length ?? 0, c.text.length, c.sectionPath.join(" > ")].join("\t"),
    );
  }
  if (result.pageCount !== null) {
    const missing = result.clauses.filter((c) => !c.bboxJson?.length);
    if (missing.length) console.warn(`WARNING: ${missing.length} clauses have no bbox`);
  }

  if (!username) return console.log("\n(dry run: pass --user <username> to write to the database)");

  const { getDb } = await import("../lib/db/client");
  const { user, documents, clauses } = await import("../lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const db = getDb();
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.username, username.toLowerCase()));
  if (!u) throw new Error(`No such user: ${username}`);
  const [doc] = await db
    .insert(documents)
    .values({ userId: u.id, filename: path.basename(file), pageCount: result.pageCount, status: "ingested" })
    .returning({ id: documents.id });
  for (let i = 0; i < result.clauses.length; i += 25) {
    await db.insert(clauses).values(result.clauses.slice(i, i + 25).map((c) => ({ ...c, documentId: doc.id })));
  }
  console.log(`\nwrote document ${doc.id}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

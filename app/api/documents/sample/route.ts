import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-guard";
import { getDb } from "@/lib/db/client";
import { documentFiles, documents, reviews } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { DEFAULT_EMBED_MODEL } from "@/lib/embed";
import { SAMPLE_FILENAME, storeDocument } from "@/lib/ingest/store";
import { loadDemoSnapshot, snapshotVectors } from "@/lib/review/cached";

export const maxDuration = 120;

/** "Try the sample MSA": ingest the bundled contract once per user; later calls point at its existing review. */
export async function POST() {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const userId = g.session.user.id;

  // Reuse only a copy that has its original file stored; older CLI-ingested copies have none and can't be viewed.
  const [existing] = await getDb()
    .select({ id: documents.id })
    .from(documents)
    .innerJoin(documentFiles, eq(documentFiles.documentId, documents.id))
    .where(and(eq(documents.userId, userId), eq(documents.filename, SAMPLE_FILENAME)))
    .limit(1);
  if (existing) {
    // Reopen the latest review of the sample instead of paying for a new one. The review page resumes it if unfinished.
    const [latest] = await getDb()
      .select({ id: reviews.id })
      .from(reviews)
      .where(and(eq(reviews.userId, userId), eq(reviews.documentId, existing.id)))
      .orderBy(desc(reviews.startedAt))
      .limit(1);
    return Response.json({ id: existing.id, reused: true, reviewId: latest?.id ?? null });
  }

  const bytes = await readFile(path.join(process.cwd(), "data", "contracts", SAMPLE_FILENAME));
  // Saved vectors mean the sample can be ingested even when the embedding provider is down (and costs no quota).
  const env = getEnv();
  const vectors = snapshotVectors(loadDemoSnapshot(), env.EMBED_MODEL || DEFAULT_EMBED_MODEL, env.EMBED_DIM);
  const doc = await storeDocument(userId, SAMPLE_FILENAME, new Uint8Array(bytes), vectors);
  return Response.json({ ...doc, reused: false }, { status: 201 });
}

import { readFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth-guard";
import { getDb } from "@/lib/db/client";
import { documents } from "@/lib/db/schema";
import { SAMPLE_FILENAME, storeDocument } from "@/lib/ingest/store";

export const maxDuration = 120;

/** "Try the sample MSA": ingest the bundled contract once per user and reuse it afterwards. */
export async function POST() {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const userId = g.session.user.id;

  const [existing] = await getDb()
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.userId, userId), eq(documents.filename, SAMPLE_FILENAME)))
    .limit(1);
  if (existing) return Response.json({ id: existing.id, reused: true });

  const bytes = await readFile(path.join(process.cwd(), "data", "contracts", SAMPLE_FILENAME));
  const doc = await storeDocument(userId, SAMPLE_FILENAME, new Uint8Array(bytes));
  return Response.json({ ...doc, reused: false }, { status: 201 });
}

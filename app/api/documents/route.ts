import { getDb } from "@/lib/db/client";
import { clauses, documents } from "@/lib/db/schema";
import { requireSession } from "@/lib/auth-guard";
import { embedTexts } from "@/lib/embed";
import { ingestBuffer, ScannedPdfError } from "@/lib/ingest";

export const maxDuration = 120;
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "multipart field 'file' is required" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ error: "file too large (10 MB max)" }, { status: 413 });
  if (!/\.(pdf|docx)$/i.test(file.name)) return Response.json({ error: "only .pdf and .docx are supported" }, { status: 415 });

  let result;
  try {
    result = await ingestBuffer(new Uint8Array(await file.arrayBuffer()), file.name);
  } catch (e) {
    const status = e instanceof ScannedPdfError ? 422 : 400;
    return Response.json({ error: e instanceof Error ? e.message : "could not read file" }, { status });
  }
  if (result.clauses.length === 0) return Response.json({ error: "no clauses found in document" }, { status: 422 });

  const vectors = await embedTexts(result.clauses.map((c) => c.text), "RETRIEVAL_QUERY");
  const db = getDb();
  const [doc] = await db
    .insert(documents)
    .values({ userId: g.session.user.id, filename: file.name, pageCount: result.pageCount, status: "ingested" })
    .returning({ id: documents.id });
  for (let i = 0; i < result.clauses.length; i += 25) {
    await db
      .insert(clauses)
      .values(result.clauses.slice(i, i + 25).map((c, j) => ({ ...c, documentId: doc.id, embedding: vectors[i + j] })));
  }
  return Response.json({ id: doc.id, clauses: result.clauses.length, pageCount: result.pageCount }, { status: 201 });
}

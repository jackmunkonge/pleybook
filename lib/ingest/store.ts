import { getDb } from "@/lib/db/client";
import { clauses, documentFiles, documents } from "@/lib/db/schema";
import { embedTexts } from "@/lib/embed";
import { ingestBuffer } from "./index";

export class EmptyDocumentError extends Error {
  constructor() {
    super("no clauses found in document");
  }
}

export const SAMPLE_FILENAME = "sample-msa.pdf";

/**
 * Parse, segment, embed and persist an upload (clauses plus the original bytes). Returns the new document id.
 * `knownVectors` (by clause text hash) skips the embedding call for clauses we already have vectors for,
 * which is how the bundled sample works even when the embedding provider is down.
 */
export async function storeDocument(
  userId: string,
  filename: string,
  bytes: Uint8Array,
  knownVectors: Map<string, number[]> = new Map(),
) {
  const result = await ingestBuffer(bytes, filename);
  if (result.clauses.length === 0) throw new EmptyDocumentError();

  const missing = result.clauses.filter((c) => !knownVectors.has(c.textHash));
  const fresh = missing.length ? await embedTexts(missing.map((c) => c.text), "RETRIEVAL_QUERY") : [];
  const freshByHash = new Map(missing.map((c, i) => [c.textHash, fresh[i]]));
  const vectors = result.clauses.map((c) => knownVectors.get(c.textHash) ?? freshByHash.get(c.textHash)!);
  const db = getDb();
  const [doc] = await db
    .insert(documents)
    .values({ userId, filename, pageCount: result.pageCount, status: "ingested" })
    .returning({ id: documents.id });
  await db.insert(documentFiles).values({
    documentId: doc.id,
    contentType: filename.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    data: Buffer.from(bytes),
  });
  for (let i = 0; i < result.clauses.length; i += 25) {
    await db
      .insert(clauses)
      .values(result.clauses.slice(i, i + 25).map((c, j) => ({ ...c, documentId: doc.id, embedding: vectors[i + j] })));
  }
  return { id: doc.id, clauses: result.clauses.length, pageCount: result.pageCount };
}

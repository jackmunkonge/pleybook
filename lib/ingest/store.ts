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

/** Parse, segment, embed and persist an upload (clauses plus the original bytes). Returns the new document id. */
export async function storeDocument(userId: string, filename: string, bytes: Uint8Array) {
  const result = await ingestBuffer(bytes, filename);
  if (result.clauses.length === 0) throw new EmptyDocumentError();

  const vectors = await embedTexts(result.clauses.map((c) => c.text), "RETRIEVAL_QUERY");
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

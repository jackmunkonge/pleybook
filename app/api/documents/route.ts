import { requireSession } from "@/lib/auth-guard";
import { ScannedPdfError } from "@/lib/ingest";
import { EmptyDocumentError, storeDocument } from "@/lib/ingest/store";

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

  try {
    const doc = await storeDocument(g.session.user.id, file.name, new Uint8Array(await file.arrayBuffer()));
    return Response.json(doc, { status: 201 });
  } catch (e) {
    if (e instanceof EmptyDocumentError || e instanceof ScannedPdfError) {
      return Response.json({ error: e.message }, { status: 422 });
    }
    return Response.json({ error: e instanceof Error ? e.message : "could not read file" }, { status: 400 });
  }
}

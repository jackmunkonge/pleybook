import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { requireSession } from "@/lib/auth-guard";
import { getDb } from "@/lib/db/client";
import { documentFiles, documents } from "@/lib/db/schema";

/** Serves the original upload to its owner (for the PDF viewer). */
export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "invalid id" }, { status: 400 });

  const [row] = await getDb()
    .select({ data: documentFiles.data, contentType: documentFiles.contentType })
    .from(documentFiles)
    .innerJoin(documents, eq(documents.id, documentFiles.documentId))
    .where(and(eq(documentFiles.documentId, id), eq(documents.userId, g.session.user.id)));
  if (!row) return Response.json({ error: "not found" }, { status: 404 });

  return new Response(new Uint8Array(row.data), {
    headers: { "content-type": row.contentType, "cache-control": "private, max-age=3600" },
  });
}

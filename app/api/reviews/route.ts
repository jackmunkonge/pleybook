import { z } from "zod";
import { requireSession } from "@/lib/auth-guard";
import { createReview, ReviewError } from "@/lib/review/job";

const body = z.object({ documentId: z.uuid() });

export async function POST(req: Request) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "documentId (uuid) is required" }, { status: 400 });
  try {
    const id = await createReview(g.session.user.id, parsed.data.documentId);
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    if (e instanceof ReviewError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

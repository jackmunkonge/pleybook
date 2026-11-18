import { z } from "zod";
import { requireSession } from "@/lib/auth-guard";
import { applyCachedReview } from "@/lib/review/cached-apply";
import { getReviewState, ReviewError } from "@/lib/review/job";

/** Swap a failed review of the sample contract for the saved demo review. */
export async function POST(_req: Request, ctx: RouteContext<"/api/reviews/[id]/cached">) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "invalid id" }, { status: 400 });
  try {
    await applyCachedReview(id, g.session.user.id);
    return Response.json(await getReviewState(id, g.session.user.id));
  } catch (e) {
    if (e instanceof ReviewError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

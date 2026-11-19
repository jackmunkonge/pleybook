import { z } from "zod";
import { requireSession } from "@/lib/auth-guard";
import { AllProvidersFailedError } from "@/lib/llm/fallback";
import { runBaseline } from "@/lib/review/baseline";
import { ReviewError } from "@/lib/review/job";

export const maxDuration = 300;

/** Run the naive single-prompt review of this review's document, for the side-by-side comparison. */
export async function POST(_req: Request, ctx: RouteContext<"/api/reviews/[id]/baseline">) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "invalid id" }, { status: 400 });
  try {
    return Response.json(await runBaseline(id, g.session.user.id));
  } catch (e) {
    if (e instanceof ReviewError) return Response.json({ error: e.message }, { status: e.status });
    if (e instanceof AllProvidersFailedError) return Response.json({ error: e.message }, { status: 502 });
    throw e;
  }
}

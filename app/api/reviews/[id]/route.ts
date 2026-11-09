import { z } from "zod";
import { requireSession } from "@/lib/auth-guard";
import { advanceReview, getReviewState, ReviewError } from "@/lib/review/job";

export const maxDuration = 300;

const idSchema = z.uuid();

async function handle(ctx: RouteContext<"/api/reviews/[id]">, advance: boolean) {
  const g = await requireSession();
  if (!g.ok) return g.response;
  const { id } = await ctx.params;
  if (!idSchema.safeParse(id).success) return Response.json({ error: "invalid id" }, { status: 400 });
  try {
    let jobError: string | undefined;
    if (advance) {
      await advanceReview(id, g.session.user.id).catch((e) => {
        if (e instanceof ReviewError) throw e;
        jobError = e instanceof Error ? e.message : String(e); // surfaced in the body; client may retry
      });
    }
    const state = await getReviewState(id, g.session.user.id);
    return Response.json(state, { status: jobError ? 502 : 200 });
  } catch (e) {
    if (e instanceof ReviewError) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

export const GET = (_req: Request, ctx: RouteContext<"/api/reviews/[id]">) => handle(ctx, false);
export const POST = (_req: Request, ctx: RouteContext<"/api/reviews/[id]">) => handle(ctx, true);

import { ReviewError } from "@/lib/review/job";

/** Maps domain errors to JSON responses; anything else is a real bug and is rethrown. */
export function playbookError(e: unknown): Response {
  if (e instanceof ReviewError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof Error && e.message.startsWith("Embedding")) {
    return Response.json({ error: "Could not embed the rule right now. Try again in a moment." }, { status: 502 });
  }
  throw e;
}

import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type SessionResult = Awaited<ReturnType<typeof auth.api.getSession>>;

/** Real auth check for route handlers. Returns the session, or null when unauthenticated. */
export async function getSession(): Promise<NonNullable<SessionResult> | null> {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Route-handler guard. Usage:
 *   const g = await requireSession(); if (!g.ok) return g.response;
 */
export async function requireSession(
  resolve: () => Promise<SessionResult> = async () =>
    auth.api.getSession({ headers: await headers() }),
): Promise<{ ok: true; session: NonNullable<SessionResult> } | { ok: false; response: Response }> {
  const session = await resolve();
  if (!session) {
    return { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { ok: true, session };
}

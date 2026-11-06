import { getSessionCookie } from "better-auth/cookies";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Optimistic redirect only: checks that a session cookie *exists*, not that it is valid.
 * Real authorization happens in route handlers / server components (lib/auth-guard.ts).
 * API routes are not redirected here; they return 401 from requireSession().
 */
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request)) {
    const url = new URL("/login", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Exclude /login, all /api routes, and static assets.
  matcher: ["/((?!login|api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

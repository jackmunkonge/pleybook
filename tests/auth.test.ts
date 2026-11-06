import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.DATABASE_URL = "postgres://u:p@localhost/db";
  process.env.BETTER_AUTH_SECRET = "s".repeat(40);
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
});

describe("requireSession", () => {
  it("returns a 401 response when there is no session", async () => {
    const { requireSession } = await import("@/lib/auth-guard");
    const result = await requireSession(async () => null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });
});

describe("invite-only sign-up", () => {
  it("rejects POST /api/auth/sign-up/email on the app auth instance", async () => {
    const { auth } = await import("@/lib/auth");
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "x@y.invalid", password: "password123", name: "x" }),
      }),
    );
    // No DB is reachable in tests, so a 400 proves it was refused before any DB access.
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/not enabled/i);
  });
});

describe("password storage", () => {
  it("hashes passwords and never stores plaintext", async () => {
    const { auth } = await import("@/lib/auth");
    const ctx = await auth.$context;
    const hash = await ctx.password.hash("hunter2hunter2");
    expect(hash).not.toContain("hunter2");
    expect(await ctx.password.verify({ hash, password: "hunter2hunter2" })).toBe(true);
    expect(await ctx.password.verify({ hash, password: "wrong-password" })).toBe(false);
  });
});

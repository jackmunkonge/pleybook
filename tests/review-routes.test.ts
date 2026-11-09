import { beforeEach, describe, expect, it, vi } from "vitest";

const { advanceReview, getReviewState, createReview, auth } = vi.hoisted(() => ({
  advanceReview: vi.fn(),
  getReviewState: vi.fn(),
  createReview: vi.fn(),
  auth: { authed: true },
}));

vi.mock("@/lib/auth-guard", () => ({
  requireSession: async () =>
    auth.authed
      ? { ok: true, session: { user: { id: "u1" } } }
      : { ok: false, response: Response.json({ error: "unauthorized" }, { status: 401 }) },
}));
vi.mock("@/lib/review/job", () => {
  class ReviewError extends Error {
    constructor(
      public status: number,
      message: string,
    ) {
      super(message);
    }
  }
  return { ReviewError, advanceReview, getReviewState, createReview };
});

import { GET, POST } from "@/app/api/reviews/[id]/route";
import { POST as createRoute } from "@/app/api/reviews/route";
import { ReviewError } from "@/lib/review/job";

const ID = "5f0d6f0e-8c3e-4e49-9a53-0d1f6f1c2b11";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) }) as never;
const req = (body?: unknown) =>
  new Request("http://x/api/reviews", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
const state = { review: { id: ID, status: "running", progress: 8, totalClauses: 19, error: "boom" }, findings: [] };

beforeEach(() => {
  auth.authed = true;
  vi.resetAllMocks();
  getReviewState.mockResolvedValue(state);
  advanceReview.mockResolvedValue(undefined);
});

describe("POST /api/reviews", () => {
  it("401s without a session", async () => {
    auth.authed = false;
    expect((await createRoute(req({ documentId: ID }))).status).toBe(401);
    expect(createReview).not.toHaveBeenCalled();
  });
  it("400s on a bad body", async () => {
    expect((await createRoute(req({ documentId: "nope" }))).status).toBe(400);
  });
  it("surfaces the daily-limit 429 and the error message", async () => {
    createReview.mockRejectedValue(new ReviewError(429, "daily review limit reached (5 per 24h)"));
    const res = await createRoute(req({ documentId: ID }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "daily review limit reached (5 per 24h)" });
  });
  it("201s with the new review id", async () => {
    createReview.mockResolvedValue(ID);
    const res = await createRoute(req({ documentId: ID }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: ID });
  });
});

describe("/api/reviews/[id]", () => {
  it("401s without a session", async () => {
    auth.authed = false;
    expect((await GET(req(), ctx())).status).toBe(401);
    expect((await POST(req(), ctx())).status).toBe(401);
    expect(advanceReview).not.toHaveBeenCalled();
  });
  it("400s on a non-uuid id", async () => {
    expect((await GET(req(), ctx("abc"))).status).toBe(400);
  });
  it("GET never advances the job", async () => {
    expect((await GET(req(), ctx())).status).toBe(200);
    expect(advanceReview).not.toHaveBeenCalled();
  });
  it("POST advances then returns state", async () => {
    advanceReview.mockResolvedValue(undefined);
    const res = await POST(req(), ctx());
    expect(res.status).toBe(200);
    expect(advanceReview).toHaveBeenCalledWith(ID, "u1");
  });
  it("returns 502 with the current state when all providers fail, so the client can retry", async () => {
    advanceReview.mockRejectedValue(new Error("All LLM providers failed: gemini(429), groq(503)"));
    const res = await POST(req(), ctx());
    expect(res.status).toBe(502);
    expect((await res.json()).review.status).toBe("running");
  });
  it("maps a ReviewError (e.g. someone else's review) to its status", async () => {
    getReviewState.mockRejectedValue(new ReviewError(404, "review not found"));
    expect((await POST(req(), ctx())).status).toBe(404);
  });
});

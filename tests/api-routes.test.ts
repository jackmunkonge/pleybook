import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  authed: true,
  storeDocument: vi.fn(),
  applyCachedReview: vi.fn(),
  getReviewState: vi.fn(),
  runBaseline: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireSession: async () =>
    m.authed
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
  return { ReviewError, getReviewState: m.getReviewState };
});
vi.mock("@/lib/ingest/store", () => {
  class EmptyDocumentError extends Error {}
  return { EmptyDocumentError, storeDocument: m.storeDocument };
});
vi.mock("@/lib/ingest", () => {
  class ScannedPdfError extends Error {}
  return { ScannedPdfError };
});
vi.mock("@/lib/review/cached-apply", () => ({ applyCachedReview: m.applyCachedReview }));
vi.mock("@/lib/review/baseline", () => ({ runBaseline: m.runBaseline }));
vi.mock("@/lib/playbook/store", () => ({ updateRule: m.updateRule, deleteRule: m.deleteRule }));

import { POST as upload } from "@/app/api/documents/route";
import { PUT, DELETE } from "@/app/api/playbook/[key]/route";
import { POST as baseline } from "@/app/api/reviews/[id]/baseline/route";
import { POST as cached } from "@/app/api/reviews/[id]/cached/route";
import { EmptyDocumentError } from "@/lib/ingest/store";
import { ScannedPdfError } from "@/lib/ingest";
import { AllProvidersFailedError } from "@/lib/llm/fallback";
import { ReviewError } from "@/lib/review/job";

const ID = "5f0d6f0e-8c3e-4e49-9a53-0d1f6f1c2b11";
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) }) as never;
const fileReq = (name: string, size = 10) => {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(size)], name));
  return new Request("http://x/api/documents", { method: "POST", body: form });
};

beforeEach(() => {
  vi.resetAllMocks();
  m.authed = true;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/documents", () => {
  it("401s without a session and stores nothing", async () => {
    m.authed = false;
    expect((await upload(fileReq("a.pdf"))).status).toBe(401);
    expect(m.storeDocument).not.toHaveBeenCalled();
  });
  it("400s when no file is sent", async () => {
    const res = await upload(new Request("http://x", { method: "POST", body: new FormData() }));
    expect(res.status).toBe(400);
  });
  it("413s over 10 MB and 415s for other file types", async () => {
    expect((await upload(fileReq("big.pdf", 10 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await upload(fileReq("notes.txt"))).status).toBe(415);
    expect(m.storeDocument).not.toHaveBeenCalled();
  });
  it("accepts .PDF and .docx names and stores for the signed-in user", async () => {
    m.storeDocument.mockResolvedValue({ id: "d1", clauses: 3 });
    expect((await upload(fileReq("A.PDF"))).status).toBe(201);
    expect((await upload(fileReq("b.docx"))).status).toBe(201);
    expect(m.storeDocument.mock.calls[0][0]).toBe("u1");
  });
  it("422s with a plain message for scanned PDFs and documents with no clauses", async () => {
    m.storeDocument.mockRejectedValueOnce(new ScannedPdfError());
    const scanned = await upload(fileReq("s.pdf"));
    expect(scanned.status).toBe(422);
    expect((await scanned.json()).error).toMatch(/scanned PDF/);
    m.storeDocument.mockRejectedValueOnce(new EmptyDocumentError());
    const empty = await upload(fileReq("e.pdf"));
    expect(empty.status).toBe(422);
    expect((await empty.json()).error).toMatch(/any clauses/);
  });
});

describe("POST /api/reviews/[id]/cached", () => {
  it("401s without a session", async () => {
    m.authed = false;
    expect((await cached(new Request("http://x"), ctx())).status).toBe(401);
    expect(m.applyCachedReview).not.toHaveBeenCalled();
  });
  it("400s on a bad id", async () => {
    expect((await cached(new Request("http://x"), ctx("nope"))).status).toBe(400);
  });
  it("passes the user id through and maps domain errors (not the sample / not failed / not yours)", async () => {
    m.applyCachedReview.mockRejectedValue(new ReviewError(409, "the live review has not failed"));
    const res = await cached(new Request("http://x"), ctx());
    expect(res.status).toBe(409);
    expect(m.applyCachedReview).toHaveBeenCalledWith(ID, "u1");
  });
  it("returns the review state on success", async () => {
    m.applyCachedReview.mockResolvedValue(undefined);
    m.getReviewState.mockResolvedValue({ review: { id: ID, cached: true } });
    const res = await cached(new Request("http://x"), ctx());
    expect((await res.json()).review.cached).toBe(true);
  });
});

describe("POST /api/reviews/[id]/baseline", () => {
  it("401s, 400s and maps 404 / provider failure", async () => {
    m.authed = false;
    expect((await baseline(new Request("http://x"), ctx())).status).toBe(401);
    m.authed = true;
    expect((await baseline(new Request("http://x"), ctx("nope"))).status).toBe(400);
    m.runBaseline.mockRejectedValueOnce(new ReviewError(404, "review not found"));
    expect((await baseline(new Request("http://x"), ctx())).status).toBe(404);
    m.runBaseline.mockRejectedValueOnce(new AllProvidersFailedError([{ provider: "gemini", model: "m", ok: false, status: 429 }]));
    expect((await baseline(new Request("http://x"), ctx())).status).toBe(502);
  });
});

describe("/api/playbook/[key]", () => {
  const rule = { ruleName: "Cap", ruleText: "Cap liability at 12 months of fees.", preferredPosition: "12 months", fallbackPosition: "24 months" };
  const put = (body: unknown) => new Request("http://x", { method: "PUT", body: JSON.stringify(body) });
  const key = { params: Promise.resolve({ key: "liability-cap" }) };

  it("401s without a session", async () => {
    m.authed = false;
    expect((await PUT(put(rule), key)).status).toBe(401);
    expect((await DELETE(new Request("http://x"), key)).status).toBe(401);
    expect(m.updateRule).not.toHaveBeenCalled();
    expect(m.deleteRule).not.toHaveBeenCalled();
  });
  it("400s on an invalid rule body without touching the store", async () => {
    expect((await PUT(put({}), key)).status).toBe(400);
    expect(m.updateRule).not.toHaveBeenCalled();
  });
  it("maps a store ReviewError (edits blocked while a review runs) to its status", async () => {
    m.deleteRule.mockRejectedValue(new ReviewError(409, "a review is running"));
    expect((await DELETE(new Request("http://x"), key)).status).toBe(409);
    expect(m.deleteRule).toHaveBeenCalledWith("u1", "liability-cap");
  });
});

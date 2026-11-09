import { beforeEach, describe, expect, it, vi } from "vitest";

// Fake drizzle builder: every chained call returns itself; awaiting it yields the next queued result.
const queue: unknown[] = [];
const inserts: unknown[] = [];
function builder(): unknown {
  const b: Record<string, unknown> = {};
  for (const m of ["select", "from", "where", "orderBy", "limit", "offset", "leftJoin"]) b[m] = () => b;
  b.insert = () => {
    inserts.push(true);
    return { values: () => ({ returning: async () => [{ id: "new-review" }] }) };
  };
  b.then = (res: (v: unknown) => unknown) => res(queue.shift());
  return b;
}
vi.mock("@/lib/db/client", () => ({ getDb: () => builder() }));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ DAILY_REVIEW_LIMIT: 3 }) }));

import { assertUnderDailyLimit, createReview, ReviewError } from "@/lib/review/job";

beforeEach(() => {
  queue.length = 0;
  inserts.length = 0;
});

describe("assertUnderDailyLimit", () => {
  it("allows counts below the limit and rejects at or above it with a 429", () => {
    expect(() => assertUnderDailyLimit(2, 3)).not.toThrow();
    for (const n of [3, 4]) {
      const err = (() => {
        try {
          assertUnderDailyLimit(n, 3);
        } catch (e) {
          return e;
        }
      })();
      expect(err).toBeInstanceOf(ReviewError);
      expect(err).toMatchObject({ status: 429 });
    }
  });
});

describe("createReview", () => {
  it("creates a review when under the limit", async () => {
    queue.push([{ id: "doc" }], [{ n: 2 }], [{ total: 19 }]);
    await expect(createReview("u1", "doc")).resolves.toBe("new-review");
    expect(inserts).toHaveLength(1);
  });
  it("returns 429 and inserts nothing once the daily limit is reached", async () => {
    queue.push([{ id: "doc" }], [{ n: 3 }]);
    await expect(createReview("u1", "doc")).rejects.toMatchObject({ status: 429 });
    expect(inserts).toHaveLength(0);
  });
  it("404s for a document the user doesn't own", async () => {
    queue.push([]);
    await expect(createReview("u1", "doc")).rejects.toMatchObject({ status: 404 });
  });
  it("422s for a document with no clauses", async () => {
    queue.push([{ id: "doc" }], [{ n: 0 }], [{ total: 0 }]);
    await expect(createReview("u1", "doc")).rejects.toMatchObject({ status: 422 });
  });
});

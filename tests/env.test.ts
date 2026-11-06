import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("requires DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrow();
  });
  it("defaults EMBED_DIM to 768 and coerces numbers", () => {
    expect(parseEnv({ DATABASE_URL: "postgres://x" }).EMBED_DIM).toBe(768);
    expect(parseEnv({ DATABASE_URL: "postgres://x", EMBED_DIM: "512" }).EMBED_DIM).toBe(512);
  });
});

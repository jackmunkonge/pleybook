import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

const base = {
  DATABASE_URL: "postgres://x",
  BETTER_AUTH_SECRET: "x".repeat(32),
  BETTER_AUTH_URL: "http://localhost:3000",
};

describe("parseEnv", () => {
  it("requires DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrow();
  });
  it("requires a long-enough BETTER_AUTH_SECRET and a valid BETTER_AUTH_URL", () => {
    expect(() => parseEnv({ ...base, BETTER_AUTH_SECRET: "short" })).toThrow();
    expect(() => parseEnv({ ...base, BETTER_AUTH_URL: "not-a-url" })).toThrow();
  });
  it("defaults EMBED_DIM to 768 and coerces numbers", () => {
    expect(parseEnv(base).EMBED_DIM).toBe(768);
    expect(parseEnv({ ...base, EMBED_DIM: "512" }).EMBED_DIM).toBe(512);
  });
});

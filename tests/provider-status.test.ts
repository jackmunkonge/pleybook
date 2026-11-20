import { describe, expect, it } from "vitest";
import { AllProvidersFailedError, withFallback, type ProviderAttempt } from "@/lib/llm/fallback";
import {
  batchTrail,
  buildProviderPanel,
  classifyFailure,
  mapProviderStates,
  panelSummary,
  parseProviderLog,
  type ChainSlot,
  type LogEntry,
} from "@/lib/review/provider-status";

const CHAIN: ChainSlot[] = [
  { name: "gemini", modelId: "gemini-3.8-flash" },
  { name: "groq", modelId: "openai/gpt-oss-120b" },
  { name: "openrouter", modelId: "openrouter/free" },
];
const running = { status: "running", cached: false };
const done = { status: "completed", cached: false };
const ok = (provider: string): ProviderAttempt => ({ provider, model: "m", ok: true });
const bad = (provider: string, status?: number): ProviderAttempt => ({ provider, model: "m", ok: false, status });
const entry = (modelUsed: string | null, ...attempts: ProviderAttempt[]): LogEntry => ({ modelUsed, attempts });
const states = (log: LogEntry[], phase = running) => mapProviderStates(CHAIN, log, phase).map((p) => p.state);

describe("classifyFailure", () => {
  it("maps 429 to rate limited, 402/403 to quota, anything else to failed", () => {
    expect(classifyFailure(429)).toBe("rate_limited");
    expect(classifyFailure(403)).toBe("quota_hit");
    expect(classifyFailure(402)).toBe("quota_hit");
    expect(classifyFailure(503)).toBe("failed");
    expect(classifyFailure(undefined)).toBe("failed");
  });
});

describe("parseProviderLog", () => {
  it("keeps well-formed entries and skips junk instead of throwing", () => {
    const raw = [
      { at: "t", modelUsed: "groq:x", attempts: [{ provider: "groq", model: "x", ok: true, error: "secret" }] },
      null,
      "nope",
      { modelUsed: 5, attempts: "nope" },
      { modelUsed: null, attempts: [{ provider: "gemini", ok: false, status: 503 }, { ok: true }] },
    ];
    const log = parseProviderLog(raw);
    expect(log).toHaveLength(2);
    expect(log[0]).toEqual({ modelUsed: "groq:x", attempts: [{ provider: "groq", model: "x", ok: true, status: undefined }] }); // error text is dropped
    expect(log[1].modelUsed).toBeNull();
    expect(log[1].attempts).toHaveLength(1);
    expect(parseProviderLog(undefined)).toEqual([]);
  });
});

describe("mapProviderStates", () => {
  it("before any call, the first provider is about to be asked and the rest wait", () => {
    expect(states([])).toEqual(["in_use", "unused", "unused"]);
  });
  it("a provider that answered the latest call is in use while running", () => {
    expect(states([entry("gemini:m", ok("gemini"))])).toEqual(["in_use", "unused", "unused"]);
  });
  it("primary rate limited: shows 429 and the fallback takes over", () => {
    const s = mapProviderStates(CHAIN, [entry("groq:m", bad("gemini", 429), ok("groq"))], running);
    expect(s.map((p) => p.state)).toEqual(["rate_limited", "in_use", "unused"]);
    expect(s[0]).toMatchObject({ httpStatus: 429, role: "Primary", detail: "HTTP 429 · rate limited" });
    expect(s[1]).toMatchObject({ role: "Fallback", label: "Groq" });
  });
  it("two providers down and the last resort answering", () => {
    expect(states([entry("openrouter:m", bad("gemini", 503), bad("groq", 403), ok("openrouter"))])).toEqual(["failed", "quota_hit", "in_use"]);
  });
  it("a failure with no HTTP status is a plain failure", () => {
    const s = mapProviderStates(CHAIN, [entry("groq:m", bad("gemini"), ok("groq"))], running);
    expect(s[0]).toMatchObject({ state: "failed", httpStatus: null, detail: "Request failed" });
  });
  it("a provider not reached in the latest call keeps 'answered' if it answered earlier", () => {
    const log = [entry("groq:m", bad("gemini", 429), ok("groq")), entry("gemini:m", ok("gemini"))];
    const s = mapProviderStates(CHAIN, log, running);
    expect(s.map((p) => p.state)).toEqual(["in_use", "answered", "unused"]);
    expect(s[1].batchesAnswered).toBe(1);
  });
  it("when the review completes, every provider that answered is 'answered' and the rest are unused", () => {
    const log = [entry("gemini:m", ok("gemini")), entry("gemini:m", ok("gemini")), entry("groq:m", bad("gemini", 429), ok("groq"))];
    const s = mapProviderStates(CHAIN, log, done);
    expect(s.map((p) => p.state)).toEqual(["answered", "answered", "unused"]);
    expect(s.map((p) => p.batchesAnswered)).toEqual([2, 1, 0]);
    expect(s[0].detail).toBe("2 batches");
    expect(s[1].detail).toBe("1 batch");
    expect(s[2].detail).toBe("Not needed");
  });
  it("all providers failed in the latest call", () => {
    expect(states([entry(null, bad("gemini", 503), bad("groq", 429), bad("openrouter", 403))])).toEqual(["failed", "rate_limited", "quota_hit"]);
  });
  it("a later success replaces an earlier all-failed entry", () => {
    const log = [entry(null, bad("gemini", 503), bad("groq", 503)), entry("gemini:m", ok("gemini"))];
    expect(states(log)).toEqual(["in_use", "unused", "unused"]);
  });
  it("a cached review shows the failures that caused it, and nothing in use", () => {
    const log = [entry(null, bad("gemini", 503), bad("groq", 429), bad("openrouter", 403))];
    expect(states(log, { status: "completed", cached: true })).toEqual(["failed", "rate_limited", "quota_hit"]);
    expect(states([], { status: "completed", cached: true })).toEqual(["unused", "unused", "unused"]);
  });
  it("roles run primary, fallback, then last resort for any longer chain", () => {
    const long = [...CHAIN, { name: "extra", modelId: "x" }];
    expect(mapProviderStates(long, [], running).map((p) => p.role)).toEqual(["Primary", "Fallback", "Last resort", "Last resort"]);
  });
  it("an empty chain maps to nothing", () => {
    expect(mapProviderStates([], [entry("gemini:m", ok("gemini"))], running)).toEqual([]);
  });
});

describe("batchTrail", () => {
  const r = (over: object) => ({ ...running, progress: 0, totalClauses: 19, ...over });
  it("shows answered calls, then the one being asked, then queued ones", () => {
    const log = [entry("gemini:m", ok("gemini")), entry("groq:m", bad("gemini", 429), ok("groq"))];
    const t = batchTrail(log, r({ progress: 16 }), 8);
    expect(t.map((s) => `${s.kind}:${s.label}`)).toEqual(["answered:Gemini", "answered:Groq", "asking:Asking"]);
    expect(batchTrail([], r({}), 8).map((s) => s.kind)).toEqual(["asking", "queued", "queued"]);
  });
  it("ignores all-failed entries (they are not batches that got answered)", () => {
    expect(batchTrail([entry(null, bad("gemini", 503))], r({ progress: 0 }), 8).filter((s) => s.kind === "answered")).toHaveLength(0);
  });
  it("a completed review shows only who answered", () => {
    const t = batchTrail([entry("gemini:m", ok("gemini")), entry("groq:m", ok("groq"))], { ...done, progress: 19, totalClauses: 19 }, 8);
    expect(t.map((s) => s.label)).toEqual(["Gemini", "Groq"]);
  });
  it("a cached review shows one saved segment per batch", () => {
    expect(batchTrail([], { status: "completed", cached: true, progress: 19, totalClauses: 19 }, 8).map((s) => s.kind)).toEqual(["cached", "cached", "cached"]);
  });
});

describe("panelSummary", () => {
  const sum = (log: LogEntry[], phase = running) => panelSummary(mapProviderStates(CHAIN, log, phase), phase);
  it("names the provider in use, noting when it is not the primary", () => {
    expect(sum([entry("gemini:m", ok("gemini"))])).toEqual({ name: "Gemini", tag: "In use", tone: "brand" });
    expect(sum([entry("groq:m", bad("gemini", 429), ok("groq"))])).toEqual({ name: "Groq", tag: "Fallback in use", tone: "brand" });
    expect(sum([entry("openrouter:m", bad("gemini", 503), bad("groq", 403), ok("openrouter"))])).toMatchObject({ tag: "Last resort in use" });
  });
  it("reports all models unavailable while every provider is failing", () => {
    expect(sum([entry(null, bad("gemini", 503), bad("groq", 429), bad("openrouter", 403))])).toEqual({ name: "All models", tag: "Unavailable", tone: "error" });
  });
  it("lists who answered once complete", () => {
    expect(sum([entry("gemini:m", ok("gemini")), entry("groq:m", bad("gemini", 429), ok("groq"))], done)).toEqual({ name: "Gemini, Groq", tag: "Answered", tone: "ok" });
  });
  it("says a saved review is cached, and that no model was needed when no call was made", () => {
    expect(sum([], { status: "completed", cached: true })).toEqual({ name: "Saved review", tag: "Cached", tone: "warn" });
    expect(sum([], done)).toMatchObject({ name: "No model needed", tone: "muted" });
  });
});

describe("with a real failing provider (withFallback)", () => {
  const slot = (name: string, run: () => Promise<string>) => ({ name, modelId: `${name}-m`, model: run });

  it("a 429 from the primary shows as rate limited and the fallback as the one in use", async () => {
    const throttled = Object.assign(new Error("Too many requests"), { statusCode: 429 });
    const { attempts, used } = await withFallback(
      [slot("gemini", async () => Promise.reject(throttled)), slot("groq", async () => "fine")],
      (m) => m(),
    );
    const panel = buildProviderPanel(CHAIN, [{ at: "t", modelUsed: `${used.name}:${used.modelId}`, attempts }], { ...running, progress: 8, totalClauses: 19 }, 8);
    expect(panel.providers.map((p) => [p.provider, p.state, p.httpStatus])).toEqual([
      ["gemini", "rate_limited", 429],
      ["groq", "in_use", null],
      ["openrouter", "unused", null],
    ]);
    expect(panel.summary).toEqual({ name: "Groq", tag: "Fallback in use", tone: "brand" });
    expect(panel.trail.map((s) => s.kind)).toEqual(["answered", "asking", "queued"]);
  });

  it("every provider failing yields attempts the panel can show (what the job now logs)", async () => {
    const failing = (status: number) => Object.assign(new Error("boom"), { statusCode: status });
    const err = await withFallback(
      [slot("gemini", async () => Promise.reject(failing(503))), slot("groq", async () => Promise.reject(failing(403))), slot("openrouter", async () => Promise.reject(failing(429)))],
      (m) => m(),
    ).catch((e) => e);
    expect(err).toBeInstanceOf(AllProvidersFailedError);
    const panel = buildProviderPanel(CHAIN, [{ modelUsed: null, attempts: (err as AllProvidersFailedError).attempts }], { ...running, progress: 0, totalClauses: 19 }, 8);
    expect(panel.providers.map((p) => p.state)).toEqual(["failed", "quota_hit", "rate_limited"]);
    expect(panel.summary.tag).toBe("Unavailable");
  });
});

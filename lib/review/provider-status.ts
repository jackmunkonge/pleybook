// Pure mapping from the provider attempt log to what the LLM status panel shows (no React, no server imports).

import type { ProviderAttempt } from "@/lib/llm/fallback";

export type ProviderState = "unused" | "in_use" | "answered" | "rate_limited" | "quota_hit" | "failed";
export type Tone = "brand" | "ok" | "warn" | "error" | "muted";

/** One provider in the configured chain, in priority order. */
export type ChainSlot = { name: string; modelId: string };

/** One `reviews.provider_log` entry: the attempts for one LLM call. `modelUsed` is null when every provider failed. */
export type LogEntry = { modelUsed: string | null; attempts: ProviderAttempt[] };

export type ReviewPhase = { status: string; cached: boolean };

export type ProviderStatus = {
  provider: string;
  label: string;
  modelId: string;
  role: "Primary" | "Fallback" | "Last resort";
  state: ProviderState;
  httpStatus: number | null;
  batchesAnswered: number;
  detail: string;
};

export type TrailSegment = { kind: "answered" | "asking" | "queued" | "cached"; label: string };

export type PanelSummary = { name: string; tag: string; tone: Tone };

export type ProviderPanel = { providers: ProviderStatus[]; trail: TrailSegment[]; summary: PanelSummary };

const DISPLAY: Record<string, string> = { gemini: "Gemini", groq: "Groq", openrouter: "OpenRouter" };
export const providerLabel = (name: string) => DISPLAY[name] ?? name.charAt(0).toUpperCase() + name.slice(1);

const ROLES = ["Primary", "Fallback", "Last resort"] as const;

/** The log is untyped jsonb, so read it defensively. Anything malformed is skipped rather than thrown. */
export function parseProviderLog(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: LogEntry[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const { modelUsed, attempts } = e as { modelUsed?: unknown; attempts?: unknown };
    if (!Array.isArray(attempts)) continue;
    const clean: ProviderAttempt[] = [];
    for (const a of attempts) {
      if (!a || typeof a !== "object") continue;
      const { provider, model, ok, status } = a as Record<string, unknown>;
      if (typeof provider !== "string" || typeof ok !== "boolean") continue;
      clean.push({ provider, model: typeof model === "string" ? model : "", ok, status: typeof status === "number" ? status : undefined });
    }
    out.push({ modelUsed: typeof modelUsed === "string" ? modelUsed : null, attempts: clean });
  }
  return out;
}

/** 429 means the provider is throttling us; 402/403 mean the key's quota or credit is gone. Anything else is a plain failure. */
export function classifyFailure(status?: number): "rate_limited" | "quota_hit" | "failed" {
  if (status === 429) return "rate_limited";
  if (status === 402 || status === 403) return "quota_hit";
  return "failed";
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "es"}`;

function detailFor(state: ProviderState, httpStatus: number | null, answered: number, active: boolean): string {
  switch (state) {
    case "unused":
      return active ? "Standing by as fallback" : "Not needed";
    case "in_use":
      return answered > 0 ? `Asking the model · ${plural(answered, "batch")} done` : "Asking the model";
    case "answered":
      return plural(answered, "batch");
    case "rate_limited":
      return `HTTP ${httpStatus ?? 429} · rate limited`;
    case "quota_hit":
      return `HTTP ${httpStatus ?? 403} · quota used up`;
    case "failed":
      return httpStatus ? `HTTP ${httpStatus} · request failed` : "Request failed";
  }
}

const isActive = (p: ReviewPhase) => !p.cached && (p.status === "pending" || p.status === "running");

/**
 * State of every configured provider. Each LLM call tries the chain in order and stops at the first
 * success, so the latest log entry says who is failing and who is answering right now:
 * - a provider that failed in the latest call shows that failure (unless the review is done and it answered earlier)
 * - one that answered the latest call is "in use" while the review runs and "answered" once it is done
 * - one not reached in the latest call keeps "answered" if it answered before, else "unused"
 */
export function mapProviderStates(chain: ChainSlot[], log: LogEntry[], phase: ReviewPhase): ProviderStatus[] {
  const active = isActive(phase);
  const latest = log.at(-1);
  return chain.map((slot, i) => {
    const answered = log.filter((e) => e.modelUsed?.startsWith(`${slot.name}:`)).length;
    const attempt = latest?.attempts.find((a) => a.provider === slot.name);
    let state: ProviderState;
    if (phase.cached) {
      state = attempt && !attempt.ok ? classifyFailure(attempt.status) : "unused";
    } else if (!active && answered > 0) {
      state = "answered";
    } else if (attempt) {
      state = attempt.ok ? (active ? "in_use" : "answered") : classifyFailure(attempt.status);
    } else if (answered > 0) {
      state = "answered";
    } else {
      state = active && !latest && i === 0 ? "in_use" : "unused"; // before any call, the first provider is the one about to be asked
    }
    const httpStatus = attempt && !attempt.ok ? (attempt.status ?? null) : null;
    return {
      provider: slot.name,
      label: providerLabel(slot.name),
      modelId: slot.modelId,
      role: ROLES[Math.min(i, ROLES.length - 1)],
      state,
      httpStatus,
      batchesAnswered: answered,
      detail: detailFor(state, httpStatus, answered, active),
    };
  });
}

/** One segment per answered LLM call, then the batches still to come. A cached review shows saved segments instead. */
export function batchTrail(
  log: LogEntry[],
  r: ReviewPhase & { progress: number; totalClauses: number },
  batchSize: number,
): TrailSegment[] {
  if (r.cached) {
    const n = Math.max(1, Math.ceil(r.totalClauses / batchSize));
    return Array.from({ length: n }, () => ({ kind: "cached", label: "Cached" }));
  }
  const answered: TrailSegment[] = log
    .filter((e) => e.modelUsed)
    .map((e) => ({ kind: "answered", label: providerLabel(e.modelUsed!.split(":")[0]) }));
  if (!isActive(r)) return answered;
  const remaining = Math.max(0, Math.ceil((r.totalClauses - r.progress) / batchSize));
  return [
    ...answered,
    ...Array.from({ length: remaining }, (_, i): TrailSegment => (i === 0 ? { kind: "asking", label: "Asking" } : { kind: "queued", label: "Queued" })),
  ];
}

/** The one line shown while the panel is collapsed: who is doing the work right now, or how it ended. */
export function panelSummary(providers: ProviderStatus[], phase: ReviewPhase): PanelSummary {
  if (phase.cached) return { name: "Saved review", tag: "Cached", tone: "warn" };
  if (isActive(phase)) {
    const live = providers.find((p) => p.state === "in_use");
    if (live) return { name: live.label, tag: live.role === "Primary" ? "In use" : `${live.role} in use`, tone: "brand" };
    const failing = providers.length > 0 && providers.every((p) => p.state === "rate_limited" || p.state === "quota_hit" || p.state === "failed");
    return failing ? { name: "All models", tag: "Unavailable", tone: "error" } : { name: "Models", tag: "Waiting", tone: "muted" };
  }
  const answered = providers.filter((p) => p.state === "answered");
  if (answered.length) return { name: answered.map((p) => p.label).join(", "), tag: "Answered", tone: "ok" };
  const failing = providers.length > 0 && providers.every((p) => p.state !== "unused");
  return failing ? { name: "All models", tag: "Failed", tone: "error" } : { name: "No model needed", tag: "Idle", tone: "muted" };
}

/** Everything the panel renders, from the stored log. */
export function buildProviderPanel(
  chain: ChainSlot[],
  rawLog: unknown,
  review: ReviewPhase & { progress: number; totalClauses: number },
  batchSize: number,
): ProviderPanel {
  const log = parseProviderLog(rawLog);
  const providers = mapProviderStates(chain, log, review);
  return { providers, trail: batchTrail(log, review, batchSize), summary: panelSummary(providers, review) };
}

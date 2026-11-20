"use client";

import { useId, useState } from "react";
import type { ProviderPanel, ProviderState, Tone, TrailSegment } from "@/lib/review/provider-status";

type Look = { box: string; icon: "spin" | "check" | "clock" | "ban" | "x" | "dash" };

// Icon and wording carry the state as well as colour, so it never relies on colour alone.
const STATE_LOOK: Record<ProviderState, Look & { label: string }> = {
  unused: { label: "Unused", icon: "dash", box: "bg-bg-subtle border-border-default text-text-tertiary" },
  in_use: { label: "In use", icon: "spin", box: "bg-brand-subtle border-brand-border text-brand-text" },
  answered: { label: "Answered", icon: "check", box: "bg-risk-ok-bg border-risk-ok-border text-risk-ok-fg" },
  rate_limited: { label: "Rate limited", icon: "clock", box: "bg-risk-medium-bg border-risk-medium-border text-risk-medium-fg" },
  quota_hit: { label: "Quota hit", icon: "ban", box: "bg-risk-medium-bg border-risk-medium-border text-risk-medium-fg" },
  failed: { label: "Failed", icon: "x", box: "bg-risk-high-bg border-risk-high-border text-risk-high-fg" },
};

const TONE_LOOK: Record<Tone, Look> = {
  brand: { icon: "spin", box: STATE_LOOK.in_use.box },
  ok: { icon: "check", box: STATE_LOOK.answered.box },
  warn: { icon: "ban", box: STATE_LOOK.quota_hit.box },
  error: { icon: "x", box: STATE_LOOK.failed.box },
  muted: { icon: "dash", box: STATE_LOOK.unused.box },
};

const SEGMENT_BAR: Record<TrailSegment["kind"], string> = {
  answered: "bg-risk-ok-solid",
  asking: "bg-brand-solid motion-safe:animate-pulse",
  queued: "bg-border-default",
  cached: "bg-risk-medium-solid",
};
const SEGMENT_TEXT: Record<TrailSegment["kind"], string> = {
  answered: "text-risk-ok-fg",
  asking: "text-brand-text",
  queued: "text-text-tertiary",
  cached: "text-risk-medium-fg",
};

const PATHS: Record<Look["icon"] | "chevron", React.ReactNode> = {
  check: <path d="M5 12l5 5L20 7" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  ban: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </>
  ),
  dash: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
    </>
  ),
  spin: <path d="M21 12a9 9 0 1 1-6.2-8.55" />,
  chevron: <path d="M6 9l6 6 6-6" />,
};

function Icon({ name, size = 14, className = "" }: { name: keyof typeof PATHS; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}

function Badge({ look, running }: { look: Look; running?: boolean }) {
  return (
    <span className={`flex size-7 shrink-0 items-center justify-center rounded-full border ${look.box}`}>
      <Icon name={look.icon} className={look.icon === "spin" && running ? "motion-safe:animate-spin" : ""} />
    </span>
  );
}

const MONO = "font-mono text-[11px] leading-[14px] font-medium tracking-[0.8px] uppercase";

/**
 * Which language models are involved in the review and what each is doing. Collapsed by default to one
 * line (who is working now, or how it ended); expands to every provider's state and which model answered each batch.
 */
export function LlmStatusPanel({ panel }: { panel: ProviderPanel }) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();
  if (panel.providers.length === 0) return null;
  const { summary, providers, trail } = panel;
  const tone = TONE_LOOK[summary.tone];

  return (
    <section aria-label="Language models" className="overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-text"
      >
        {open ? (
          <span className={`${MONO} flex-1 text-text-tertiary`}>Models</span>
        ) : (
          <>
            <Badge look={tone} running />
            <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2" aria-live="polite" aria-atomic>
              <span className="truncate text-sm leading-[22px] font-medium">{summary.name}</span>
              <span className={`${MONO} ${tone.box.split(" ").at(-1)}`}>{summary.tag}</span>
            </span>
          </>
        )}
        {open && <span className={`${MONO} ${tone.box.split(" ").at(-1)}`}>{summary.tag}</span>}
        <Icon name="chevron" size={16} className={`shrink-0 text-text-tertiary transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div id={bodyId}>
          <ul>
            {providers.map((p) => {
              const look = STATE_LOOK[p.state];
              return (
                <li
                  key={p.provider}
                  className={`flex items-center gap-3 border-t border-border-default px-4 py-3 ${p.state === "in_use" ? "bg-brand-subtle" : ""}`}
                >
                  <Badge look={look} running />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <p className="flex items-baseline gap-2">
                      <span className="text-sm leading-[22px] font-medium">{p.label}</span>
                      <span className={`${MONO} text-text-tertiary`}>{p.role}</span>
                    </p>
                    <p className="truncate font-mono text-xs leading-[18px] text-text-secondary" title={`${p.modelId} · ${p.detail}`}>
                      {p.modelId} · {p.detail}
                    </p>
                  </div>
                  <span className={`${MONO} shrink-0 rounded-full border px-2.5 py-1 ${look.box}`}>{look.label}</span>
                </li>
              );
            })}
          </ul>
          {trail.length > 0 && (
            <div className="flex flex-col gap-2 border-t border-border-default px-4 pt-3 pb-3.5">
              <p className={`${MONO} text-text-tertiary`}>{trail.some((s) => s.kind === "cached") ? "Source" : "Answered by"}</p>
              <ol className="flex gap-2">
                {trail.map((s, i) => (
                  <li key={i} className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className={`h-1 rounded-full ${SEGMENT_BAR[s.kind]}`} />
                    <span className={`${MONO} truncate ${SEGMENT_TEXT[s.kind]}`}>
                      {i + 1} · {s.label}
                      {s.kind === "answered" && " ✓"}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

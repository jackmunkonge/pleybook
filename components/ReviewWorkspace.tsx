"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { describeReviewError } from "@/lib/errors";
import type { getReviewState } from "@/lib/review/job";
import { modelsUsed, sortFindings, type FindingView } from "@/lib/review/view";
import { BaselineTab } from "./BaselineTab";
import { DocLoading } from "./Skeleton";
import { CoverageLine } from "./CoverageLine";
import { FindingsTable } from "./FindingsTable";
import { LlmStatusPanel } from "./LlmStatusPanel";
import { ProviderBadge } from "./ProviderBadge";
import { Grabber, useSheetDrag } from "./Sheet";
import { RiskBadge } from "./RiskBadge";
import { TextViewer } from "./TextViewer";

// react-pdf touches browser-only APIs, so it must never render on the server.
const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => <DocLoading />,
});

type State = Awaited<ReturnType<typeof getReviewState>>;
const MAX_AUTO_RETRIES = 3;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ReviewWorkspace({ initial }: { initial: State }) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [retryNote, setRetryNote] = useState<string | null>(null);
  const [running, setRunning] = useState(initial.review.status !== "completed");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [tab, setTab] = useState<"findings" | "baseline">("findings");
  // Below lg the document and the findings are separate full-screen views (see the Figma mobile frames).
  const [mobileView, setMobileView] = useState<"document" | "findings">("document");
  const inFlight = useRef(false);
  const id = state.review.id;
  const findings = state.findings as FindingView[];

  /** Ask the server to replace this failed sample review with the saved one. True when it worked. */
  const fetchSavedReview = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews/${id}/cached`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as State | null;
      if (!res.ok || !body?.review) return false;
      setState(body);
      return true;
    } catch {
      return false;
    }
  }, [id]);

  /** Drive the job one batch per request until it completes (each request stays well under the function limit). */
  const run = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      let last = -1;
      let failures = 0;
      for (;;) {
        const res = await fetch(`/api/reviews/${id}`, { method: "POST" });
        const body = (await res.json().catch(() => null)) as (State & { error?: string }) | null;
        if (body?.review) setState(body);
        if (!res.ok) {
          // Provider outages are often transient (503s, overload): back off and retry a few times before asking the user.
          const retryable = res.status === 502 || res.status >= 500;
          if (retryable && failures < MAX_AUTO_RETRIES) {
            const wait = 5000 * 2 ** failures++;
            setRetryNote(`A model provider failed. Retrying in ${wait / 1000}s (attempt ${failures} of ${MAX_AUTO_RETRIES})…`);
            await sleep(wait);
            setRetryNote(null);
            continue;
          }
          // The sample contract has a saved review: use it rather than leave a demo stuck on an error.
          if (state.document.isSample && retryable && (await fetchSavedReview())) return;
          setError(body?.review?.error ?? body?.error ?? `Request failed (${res.status})`);
          return;
        }
        failures = 0;
        if (body!.review.status === "completed") return;
        // Another tab may hold the batch lease: wait instead of hammering the endpoint.
        if (body!.review.progress === last) await sleep(2500);
        last = body!.review.progress;
      }
    } catch {
      setError("Network error. Check your connection and retry.");
    } finally {
      inFlight.current = false;
      setRetryNote(null);
      setRunning(false);
    }
  }, [id, state.document.isSample, fetchSavedReview]);

  const retry = () => {
    setError(null);
    setRunning(true);
    void run();
  };

  // Deferred + cancellable: strict-mode's mount/unmount/mount then starts exactly one loop.
  useEffect(() => {
    if (initial.review.status === "completed") return;
    const t = setTimeout(() => void run(), 0);
    return () => clearTimeout(t);
  }, [initial.review.status, run]);

  const select = (fid: string) => {
    setSelectedId(fid);
    document.querySelector(`[data-row="${fid}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const { review, document: doc } = state;
  const done = review.status === "completed";
  const isPdf = doc.hasFile && doc.filename.toLowerCase().endsWith(".pdf") && !pdfFailed;
  const friendly = error ? describeReviewError(error) : null;
  const truncated = doc.documentClauses > review.totalClauses;
  const pct = review.totalClauses ? Math.round((review.progress / review.totalClauses) * 100) : 0;

  const models = modelsUsed(findings);
  const sheetFinding = findings.find((f) => f.id === selectedId) ?? sortFindings(findings, "risk").find((f) => f.riskLevel !== "none") ?? null;
  const counts = {
    high: findings.filter((f) => f.clauseId && f.riskLevel === "high").length,
    medium: findings.filter((f) => f.clauseId && f.riskLevel === "medium").length,
    missing: findings.filter((f) => !f.clauseId).length,
  };
  const drag = useSheetDrag(() => setMobileView("document"));
  const pending = done ? 0 : Math.min(2, Math.max(0, review.totalClauses - review.progress));

  return (
    <div className="flex min-h-0 flex-1 flex-col max-lg:overflow-y-auto lg:flex-row lg:overflow-hidden">
      <section
        className="relative flex-col bg-bg-subtle max-lg:fixed max-lg:inset-0 max-lg:z-30 max-lg:flex lg:flex lg:min-h-0 lg:flex-1"
        aria-label="Document"
      >
        {/* Mobile top bar (replaces the global nav while reading the document). */}
        {/* TODO(design): the Figma mobile top bar has a "more" (⋮) menu on the right. It has no actions yet. */}
        <div className="flex items-center gap-3 border-b border-border-default bg-bg-surface px-4 py-3.5 lg:hidden">
          <Link href="/" aria-label="Back to reviews" className="flex size-5 items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ui/arrow-left.svg" alt="" width={20} height={20} className="dark:invert" />
          </Link>
          <p className="min-w-0 flex-1 truncate text-[15px] leading-[22px] font-medium tracking-[-0.1px]">{doc.filename}</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto max-lg:pb-72">
          {isPdf ? (
            <PdfViewer fileUrl={`/api/documents/${doc.id}/file`} findings={findings} selectedId={selectedId} onSelect={select} onError={() => setPdfFailed(true)} />
          ) : (
            <TextViewer findings={findings} selectedId={selectedId} onSelect={select} />
          )}
        </div>

        {/* Mobile bottom sheet: summary plus the selected (or worst) finding. Tapping it opens the full list. */}
        <button
          type="button"
          onClick={() => setMobileView("findings")}
          className="absolute inset-x-0 bottom-0 flex flex-col gap-3 rounded-t-3xl bg-bg-canvas px-4 pt-2.5 pb-4 text-left shadow-floating lg:hidden"
        >
          <span className="mx-auto h-1 w-10 rounded-full bg-border-strong" />
          <span className="flex items-center gap-2">
            <span className="flex-1 text-xl leading-[26px] font-semibold tracking-[-0.3px]">Findings</span>
            <span className="text-xs leading-4 text-text-secondary">
              {counts.high} high · {counts.medium} medium · {counts.missing} missing
            </span>
          </span>
          <CoverageBar findings={findings} />
          {sheetFinding ? (
            <span className="flex flex-col gap-2 rounded-[14px] border-[1.5px] border-brand-solid bg-bg-surface px-4 py-3.5">
              <span className="flex items-center gap-2.5">
                <RiskBadge risk={sheetFinding.riskLevel} />
                <span className="font-mono text-xs leading-[18px] text-text-tertiary">{sheetFinding.clauseId ? (sheetFinding.clauseRef ?? "clause") : "missing clause"}</span>
                {sheetFinding.clauseId && sheetFinding.citationVerified && <span className="text-xs leading-4 text-risk-ok-fg">✓ Quote verified</span>}
              </span>
              <span className="text-[15px] leading-[22px] font-medium tracking-[-0.1px]">{sheetFinding.ruleName ?? "No matching rule"}</span>
              {sheetFinding.deviationReason && <span className="line-clamp-2 text-[13px] leading-5 text-text-secondary">{sheetFinding.deviationReason}</span>}
            </span>
          ) : (
            <span className="text-sm text-text-tertiary">{done ? "No issues found." : "Findings appear here as clauses are reviewed."}</span>
          )}
        </button>
      </section>

      {mobileView === "findings" && (
        <button type="button" aria-label="Collapse findings" tabIndex={-1} onClick={() => setMobileView("document")} className="sheet-fade fixed inset-0 z-40 bg-black/40 lg:hidden" />
      )}
      <section
        style={drag.style}
        className={`min-h-0 flex-col gap-4 bg-bg-canvas p-5 max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-50 max-lg:h-[92dvh] max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:rounded-t-3xl max-lg:pt-0 max-lg:shadow-floating lg:flex lg:w-[580px] lg:flex-none lg:overflow-y-auto lg:border-l lg:border-border-default lg:p-6 ${
          mobileView === "findings" ? "sheet-up flex" : "hidden"
        }`}
        aria-label="Findings"
      >
        {/* Drawer header: stays pinned while the findings scroll. Swipe it down to collapse. */}
        <div className="flex flex-col gap-2 max-lg:sticky max-lg:top-0 max-lg:z-20 max-lg:-mx-5 max-lg:border-b max-lg:border-border-default max-lg:bg-bg-canvas max-lg:px-5 max-lg:pb-3">
          <div {...drag.handlers} className="-mx-5 cursor-grab touch-none px-5 pt-2.5 pb-1 lg:hidden">
            <Grabber />
          </div>
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-1.5 text-xs leading-4 text-text-secondary hover:text-text-primary">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ui/arrow-left.svg" alt="" width={14} height={14} className="dark:invert" />
            New review
          </Link>
          <button type="button" onClick={() => setMobileView("document")} className="text-xs leading-4 font-medium text-brand-text lg:hidden">
            View document
          </button>
        </div>
        </div>
        <h1 className="truncate text-[28px] leading-[34px] font-semibold tracking-[-0.6px]">{doc.filename}</h1>
        <CoverageLine findings={findings} />

        {!done && (
          <div role="status" className="flex flex-col gap-3 rounded-2xl border border-border-default bg-bg-surface p-5 text-text-primary shadow-floating">
            <div className="flex items-center gap-2.5">
              <span className={`size-2 rounded-full bg-brand-solid ${running ? "animate-pulse shadow-[0_0_8px_var(--brand-solid)]" : "opacity-50"}`} />
              <p className="flex-1 text-sm leading-[22px] font-medium">
                {running ? "Reviewing" : "Paused at"} clause {Math.min(review.progress + (running ? 1 : 0), review.totalClauses)} of {review.totalClauses}
              </p>
              <p className="text-[22px] leading-7 font-medium tabular-nums">{pct}%</p>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-border-default">
              <div className="h-full rounded-full bg-brand-solid transition-all" style={{ width: `${pct}%` }} />
            </div>
            {/* TODO(design): Figma also shows "Batch 2 of 3" and "~25s left" here. The client does not know the batch size or have a time estimate. */}
            <p className="font-mono text-xs leading-[18px] text-text-tertiary">
              {retryNote ?? (models.length ? models.join(" · ") : "Starting up…")}
            </p>
          </div>
        )}
        <LlmStatusPanel panel={state.llm} />
        {review.cached && (
          <div role="status" className="rounded-[14px] border border-risk-low-border bg-risk-low-bg p-3 text-sm text-risk-low-fg">
            <p>
              <span className="mr-2 rounded-full border border-risk-low-border px-2 py-0.5 font-mono text-[11px] font-medium tracking-[0.8px] uppercase">Cached</span>
              The AI providers were unavailable, so this is a saved review of the sample contract rather than a live run.
            </p>
          </div>
        )}
        {truncated && (
          <p role="note" className="rounded-[14px] border border-risk-medium-border bg-risk-medium-bg p-3 text-sm text-risk-medium-fg">
            This contract has {doc.documentClauses} clauses. To stay within free-tier limits, only the first {review.totalClauses} were
            reviewed, so the rest was not checked and missing-clause detection was skipped.
          </p>
        )}
        {error && (
          <div role="alert" className="rounded-[14px] border border-risk-high-border bg-risk-high-bg p-3 text-sm text-risk-high-fg">
            <p>{friendly?.message}</p>
            {friendly?.detail && (
              <details className="mt-1 text-xs opacity-80">
                <summary className="cursor-pointer">Technical details</summary>
                <p className="mt-1 break-words font-mono">{friendly.detail}</p>
              </details>
            )}
            <button onClick={retry} disabled={running} className="mt-2 rounded-lg bg-risk-high-solid px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60">
              Retry
            </button>
          </div>
        )}

        {done && (
          <div role="tablist" aria-label="Review view" className="flex gap-0.5 rounded-[10px] bg-bg-subtle p-[3px]">
            {(["findings", "baseline"] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`flex-1 rounded-lg py-[7px] text-sm leading-[22px] font-medium ${
                  tab === t ? "bg-bg-surface text-text-primary shadow-card" : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {t === "findings" ? "Findings" : "vs. single prompt"}
              </button>
            ))}
          </div>
        )}
        {!done && findings.length > 0 && (
          <p className="flex items-center gap-2 font-mono text-[11px] leading-[14px] font-medium tracking-[0.8px] text-text-tertiary uppercase">
            Findings so far
            <span className="rounded bg-brand-solid px-1.5 py-0.5 text-brand-on-solid">Live</span>
          </p>
        )}
        {done && tab === "baseline" ? (
          <BaselineTab reviewId={id} findings={findings} />
        ) : (
          <FindingsTable findings={findings} selectedId={selectedId} onSelect={select} pendingCards={pending} />
        )}

        <footer className="mt-auto flex flex-col gap-1 border-t border-border-default pt-3">
          <ProviderBadge findings={findings} cached={review.cached} />
          <p className="text-xs text-text-tertiary">The first request after a quiet period can take a few seconds while the database wakes up.</p>
        </footer>
      </section>
    </div>
  );
}

function CoverageBar({ findings }: { findings: FindingView[] }) {
  const clauses = findings.filter((f) => f.clauseId);
  const seg = [
    { r: "high", c: "bg-risk-high-solid" },
    { r: "medium", c: "bg-risk-medium-solid" },
    { r: "low", c: "bg-risk-low-solid" },
    { r: "none", c: "bg-risk-ok-solid" },
  ] as const;
  return (
    <span className="flex h-1.5 w-full gap-[3px]">
      {seg.map(({ r, c }) => {
        const n = clauses.filter((f) => f.riskLevel === r).length;
        return n > 0 ? <span key={r} className={`rounded-full ${c}`} style={{ flex: n }} /> : null;
      })}
      {clauses.length === 0 && <span className="flex-1 rounded-full bg-bg-subtle" />}
    </span>
  );
}

"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { describeReviewError } from "@/lib/errors";
import type { getReviewState } from "@/lib/review/job";
import type { FindingView } from "@/lib/review/view";
import { CoverageLine } from "./CoverageLine";
import { FindingsTable } from "./FindingsTable";
import { ProviderBadge } from "./ProviderBadge";
import { TextViewer } from "./TextViewer";

// react-pdf touches browser-only APIs, so it must never render on the server.
const PdfViewer = dynamic(() => import("./PdfViewer"), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-zinc-500">Loading viewer…</p>,
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

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <section className="min-h-[50vh] flex-1 overflow-y-auto bg-zinc-100 p-4 dark:bg-zinc-900/60 lg:min-h-0" aria-label="Document">
        {isPdf ? (
          <PdfViewer fileUrl={`/api/documents/${doc.id}/file`} findings={findings} selectedId={selectedId} onSelect={select} onError={() => setPdfFailed(true)} />
        ) : (
          <TextViewer findings={findings} selectedId={selectedId} onSelect={select} />
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-t border-zinc-200 p-4 dark:border-zinc-800 lg:max-w-xl lg:border-l lg:border-t-0" aria-label="Findings">
        <div>
          <Link href="/" className="text-xs underline">← New review</Link>
          <h1 className="truncate text-lg font-semibold">{doc.filename}</h1>
          <CoverageLine findings={findings} />
        </div>

        {!done && (
          <div role="status" className="space-y-1">
            <div className="h-2 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
              <div className="h-full bg-zinc-900 transition-all dark:bg-zinc-100" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-zinc-500">
              {running ? "Reviewing" : "Paused"}: {review.progress} of {review.totalClauses} clauses
            </p>
            {retryNote && <p className="text-xs text-amber-700 dark:text-amber-400">{retryNote}</p>}
          </div>
        )}
        {review.cached && (
          <div role="status" className="rounded border border-sky-300 bg-sky-50 p-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100">
            <p>
              <span className="mr-2 rounded bg-sky-200 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide dark:bg-sky-900">Cached</span>
              The AI providers were unavailable, so this is a saved review of the sample contract rather than a live run.
            </p>
          </div>
        )}
        {truncated && (
          <p role="note" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100">
            This contract has {doc.documentClauses} clauses. To stay within free-tier limits, only the first {review.totalClauses} were
            reviewed, so the rest was not checked and missing-clause detection was skipped.
          </p>
        )}
        {error && (
          <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <p>{friendly?.message}</p>
            {friendly?.detail && (
              <details className="mt-1 text-xs opacity-80">
                <summary className="cursor-pointer">Technical details</summary>
                <p className="mt-1 break-words font-mono">{friendly.detail}</p>
              </details>
            )}
            <button onClick={retry} disabled={running} className="mt-2 rounded bg-red-800 px-2.5 py-1 text-xs text-white disabled:opacity-60">
              Retry
            </button>
          </div>
        )}

        <FindingsTable findings={findings} selectedId={selectedId} onSelect={select} />

        <footer className="mt-auto space-y-1 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <ProviderBadge findings={findings} cached={review.cached} />
          <p className="text-xs text-zinc-500">The first request after a quiet period can take a few seconds while the database wakes up.</p>
        </footer>
      </section>
    </div>
  );
}

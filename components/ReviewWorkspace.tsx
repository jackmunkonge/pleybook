"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ReviewWorkspace({ initial }: { initial: State }) {
  const [state, setState] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(initial.review.status !== "completed");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pdfFailed, setPdfFailed] = useState(false);
  const inFlight = useRef(false);
  const id = state.review.id;
  const findings = state.findings as FindingView[];

  /** Drive the job one batch per request until it completes (each request stays well under the function limit). */
  const run = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      let last = -1;
      for (;;) {
        const res = await fetch(`/api/reviews/${id}`, { method: "POST" });
        const body = (await res.json().catch(() => null)) as (State & { error?: string }) | null;
        if (body?.review) setState(body);
        if (!res.ok) {
          setError(body?.review?.error ?? body?.error ?? `Request failed (${res.status})`);
          return;
        }
        if (body!.review.status === "completed") return;
        // Another tab may hold the batch lease: wait instead of hammering the endpoint.
        if (body!.review.progress === last) await sleep(2500);
        last = body!.review.progress;
      }
    } catch {
      setError("Network error. Check your connection and retry.");
    } finally {
      inFlight.current = false;
      setRunning(false);
    }
  }, [id]);

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
          </div>
        )}
        {error && (
          <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
            <p>{error}</p>
            <button onClick={retry} disabled={running} className="mt-2 rounded bg-red-800 px-2.5 py-1 text-xs text-white disabled:opacity-60">
              Retry
            </button>
          </div>
        )}

        <FindingsTable findings={findings} selectedId={selectedId} onSelect={select} />

        <footer className="mt-auto space-y-1 border-t border-zinc-200 pt-3 dark:border-zinc-800">
          <ProviderBadge findings={findings} />
          <p className="text-xs text-zinc-500">The first request after a quiet period can take a few seconds while the database wakes up.</p>
        </footer>
      </section>
    </div>
  );
}

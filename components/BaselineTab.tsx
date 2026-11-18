"use client";

import { useState } from "react";
import type { BaselineResult } from "@/lib/review/baseline";
import { compareBaseline, summarizeComparison } from "@/lib/review/baseline-compare";
import type { FindingView } from "@/lib/review/view";
import { RiskBadge } from "./RiskBadge";

export function BaselineTab({ reviewId, findings }: { reviewId: string; findings: FindingView[] }) {
  const [result, setResult] = useState<BaselineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reviews/${reviewId}/baseline`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) setError(body?.error ?? `Request failed (${res.status})`);
      else setResult(body as BaselineResult);
    } catch {
      setError("Network error. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  };

  const cmp = result ? compareBaseline(findings, result.risks) : null;
  const sum = cmp ? summarizeComparison(cmp) : null;

  return (
    <div className="space-y-3 text-sm">
      <p className="text-zinc-600 dark:text-zinc-400">
        What you get from one plain &ldquo;summarize this contract and flag the risks&rdquo; prompt: the whole contract in a single
        call, no playbook, no retrieval, no quote checking. Run it to see which of the pipeline&rsquo;s findings it misses.
      </p>
      <button
        onClick={run}
        disabled={loading}
        className="rounded bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900"
      >
        {loading ? "Running baseline…" : result ? "Run again" : "Run the baseline"}
      </button>
      {error && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </p>
      )}

      {result && cmp && sum && (
        <div className="space-y-4">
          <p role="status" className="rounded border border-zinc-200 p-3 dark:border-zinc-800">
            The baseline pointed at <strong>{sum.caught} of {sum.pipelineTotal}</strong> pipeline findings and missed{" "}
            <strong>{sum.missed}</strong>
            {sum.missingClauses > 0 && <> ({sum.missingClauses} of them clauses the contract never contains)</>}.
            {sum.extra > 0 && <> It also raised {sum.extra} risk{sum.extra === 1 ? "" : "s"} the pipeline did not.</>}
          </p>

          <section>
            <h3 className="mb-1 font-medium">Baseline summary</h3>
            <p className="text-zinc-700 dark:text-zinc-300">{result.summary}</p>
            {result.truncated && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">The contract was too long for one prompt, so the baseline only saw the start.</p>}
          </section>

          <section>
            <h3 className="mb-1 font-medium">Missed by the baseline ({cmp.missed.length})</h3>
            {cmp.missed.length === 0 ? (
              <p className="text-zinc-500">Nothing: the baseline pointed at every finding.</p>
            ) : (
              <ul className="space-y-1.5">
                {cmp.missed.map((m) => (
                  <li key={m.id} className="rounded border border-red-200 bg-red-50/50 p-2 dark:border-red-950 dark:bg-red-950/20">
                    <div className="flex items-center gap-2">
                      <RiskBadge risk={m.riskLevel} />
                      <span className="font-medium">{m.clauseId ? `Clause ${m.clauseRef ?? "?"}` : "Missing clause"}</span>
                      <span className="text-xs text-zinc-500">{m.ruleName}</span>
                    </div>
                    {m.deviationReason && <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{m.deviationReason}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="mb-1 font-medium">Risks the baseline raised ({result.risks.length})</h3>
            <ul className="space-y-1.5">
              {result.risks.map((r, i) => {
                const caught = cmp.caught.find((c) => c.risk === r);
                const extra = cmp.extra.find((x) => x.risk === r);
                return (
                  <li key={i} className="rounded border border-zinc-200 p-2 dark:border-zinc-800">
                    <div className="flex flex-wrap items-center gap-2">
                      <RiskBadge risk={r.risk_level} />
                      <span className="font-medium">{r.title}</span>
                      {caught && <span className="text-xs text-emerald-700 dark:text-emerald-400">also found (clause {caught.finding.clauseRef})</span>}
                      {extra && !extra.quoteFound && <span className="text-xs text-amber-700 dark:text-amber-400">quote not found in the contract</span>}
                      {extra?.quoteFound && <span className="text-xs text-zinc-500">pipeline cleared clause {extra.clauseRef}</span>}
                    </div>
                    <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{r.explanation}</p>
                  </li>
                );
              })}
            </ul>
          </section>
          <p className="text-xs text-zinc-500">
            Answered by {result.modelUsed}. A single live run, so it varies. The measured comparison over 12 contracts is on the Evaluation page.
          </p>
        </div>
      )}
    </div>
  );
}

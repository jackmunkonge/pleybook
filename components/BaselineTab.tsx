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
      <p className="text-text-secondary">
        What you get from one plain &ldquo;summarize this contract and flag the risks&rdquo; prompt: the whole contract in a single
        call, no playbook, no retrieval, no quote checking. Run it to see which of the pipeline&rsquo;s findings it misses.
      </p>
      <button
        onClick={run}
        disabled={loading}
        className="rounded-[10px] bg-brand-solid px-4 py-2.5 text-sm leading-5 font-medium text-brand-on-solid hover:opacity-90 disabled:opacity-60"
      >
        {loading ? "Running baseline…" : result ? "Run again" : "Run the baseline"}
      </button>
      {error && (
        <p role="alert" className="rounded-[14px] border border-risk-high-border bg-risk-high-bg p-3 text-xs text-risk-high-fg">
          {error}
        </p>
      )}

      {result && cmp && sum && (
        <div className="space-y-4">
          <p role="status" className="rounded-[14px] border border-border-default bg-bg-surface p-3.5">
            The baseline pointed at <strong>{sum.caught} of {sum.pipelineTotal}</strong> pipeline findings and missed{" "}
            <strong>{sum.missed}</strong>
            {sum.missingClauses > 0 && <> ({sum.missingClauses} of them clauses the contract never contains)</>}.
            {sum.extra > 0 && <> It also raised {sum.extra} risk{sum.extra === 1 ? "" : "s"} the pipeline did not.</>}
          </p>

          <section>
            <h3 className="mb-1 font-medium">Baseline summary</h3>
            <p className="text-text-secondary">{result.summary}</p>
            {result.truncated && <p className="mt-1 text-xs text-risk-medium-fg">The contract was too long for one prompt, so the baseline only saw the start.</p>}
          </section>

          <section>
            <h3 className="mb-1 font-medium">Missed by the baseline ({cmp.missed.length})</h3>
            {cmp.missed.length === 0 ? (
              <p className="text-text-tertiary">Nothing: the baseline pointed at every finding.</p>
            ) : (
              <ul className="space-y-1.5">
                {cmp.missed.map((m) => (
                  <li key={m.id} className="rounded-[14px] border border-risk-high-border bg-risk-high-bg p-3.5">
                    <div className="flex items-center gap-2">
                      <RiskBadge risk={m.riskLevel} />
                      <span className="font-medium">{m.clauseId ? `Clause ${m.clauseRef ?? "?"}` : "Missing clause"}</span>
                      <span className="text-xs text-text-tertiary">{m.ruleName}</span>
                    </div>
                    {m.deviationReason && <p className="mt-1 text-xs text-text-secondary">{m.deviationReason}</p>}
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
                  <li key={i} className="rounded-[14px] border border-border-default bg-bg-surface p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <RiskBadge risk={r.risk_level} />
                      <span className="font-medium">{r.title}</span>
                      {caught && <span className="text-xs text-risk-ok-fg">also found (clause {caught.finding.clauseRef})</span>}
                      {extra && !extra.quoteFound && <span className="text-xs text-risk-medium-fg">quote not found in the contract</span>}
                      {extra?.quoteFound && <span className="text-xs text-text-tertiary">pipeline cleared clause {extra.clauseRef}</span>}
                    </div>
                    <p className="mt-1 text-xs text-text-secondary">{r.explanation}</p>
                  </li>
                );
              })}
            </ul>
          </section>
          <p className="text-xs text-text-tertiary">
            Answered by {result.modelUsed}. A single live run, so it varies. The measured comparison over 12 contracts is on the Evaluation page.
          </p>
        </div>
      )}
    </div>
  );
}

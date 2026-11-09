"use client";

import { useState } from "react";
import { sortFindings, type FindingView } from "@/lib/review/view";
import { ReasoningPanel } from "./ReasoningPanel";
import { RiskBadge } from "./RiskBadge";

export function FindingsTable({ findings, selectedId, onSelect }: { findings: FindingView[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const [by, setBy] = useState<"risk" | "order">("risk");
  const [showReasoning, setShowReasoning] = useState<string | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(true);
  const rows = sortFindings(findings, by).filter((f) => !onlyIssues || f.riskLevel !== "none");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1">
          Sort
          <select value={by} onChange={(e) => setBy(e.target.value as "risk" | "order")} className="rounded border border-zinc-300 bg-transparent px-1 py-0.5 dark:border-zinc-700">
            <option value="risk">Risk (high first)</option>
            <option value="order">Document order</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} />
          Hide clauses with no issue
        </label>
      </div>
      {rows.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">No findings yet.</p>}
      <ul className="flex flex-col gap-1.5">
        {rows.map((f) => {
          const selected = f.id === selectedId;
          return (
            <li key={f.id} data-row={f.id} className={`rounded border p-2.5 text-sm ${selected ? "border-zinc-900 dark:border-zinc-100" : "border-zinc-200 dark:border-zinc-800"}`}>
              <button type="button" onClick={() => onSelect(f.id)} className="flex w-full flex-col gap-1 text-left">
                <span className="flex items-center gap-2">
                  <RiskBadge risk={f.riskLevel} />
                  <span className="font-mono text-xs text-zinc-500">{f.clauseId ? (f.clauseRef ?? "clause") : "missing clause"}</span>
                  <span className="font-medium">{f.ruleName ?? "No matching rule"}</span>
                  {f.clauseId && (f.confidence === "low" || !f.citationVerified) && f.riskLevel !== "none" && (
                    <span className="ml-auto text-xs text-amber-700 dark:text-amber-400" title={f.citationVerified ? "Low confidence" : "Quote could not be verified in the clause"}>
                      {f.citationVerified ? "low confidence" : "⚠ unverified"}
                    </span>
                  )}
                </span>
                {f.deviationReason && <span className="text-zinc-700 dark:text-zinc-300">{f.deviationReason}</span>}
              </button>
              {selected && (
                <>
                  <button type="button" onClick={() => setShowReasoning(showReasoning === f.id ? null : f.id)} className="mt-1 text-xs underline">
                    {showReasoning === f.id ? "Hide reasoning" : "Show reasoning"}
                  </button>
                  {showReasoning === f.id && <ReasoningPanel finding={f} />}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

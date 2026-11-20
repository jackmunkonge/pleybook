"use client";

import { useState } from "react";
import { sortFindings, type FindingView } from "@/lib/review/view";
import { ReasoningPanel } from "./ReasoningPanel";
import { RiskBadge } from "./RiskBadge";

export function FindingsTable({
  findings,
  selectedId,
  onSelect,
  pendingCards = 0,
}: {
  findings: FindingView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Skeleton cards shown for clauses still being reviewed. */
  pendingCards?: number;
}) {
  const [by, setBy] = useState<"risk" | "order">("risk");
  const [showReasoning, setShowReasoning] = useState<string | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(true);
  const rows = sortFindings(findings, by).filter((f) => !onlyIssues || f.riskLevel !== "none");

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 text-xs leading-4">
        <label className="relative flex items-center rounded-lg border border-border-strong bg-bg-surface py-1.5 pr-2.5 pl-3 text-text-primary">
          <span className="pointer-events-none">
            <span className="hidden lg:inline">Sort: </span>
            {by === "risk" ? "Risk (high first)" : "Document order"}
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ui/chev-down.svg" alt="" width={14} height={14} className="pointer-events-none ml-1.5" />
          <select
            aria-label="Sort findings"
            value={by}
            onChange={(e) => setBy(e.target.value as "risk" | "order")}
            className="absolute inset-0 cursor-pointer opacity-0"
          >
            <option value="risk">Risk (high first)</option>
            <option value="order">Document order</option>
          </select>
        </label>
        <span className="flex-1" />
        <label className="flex cursor-pointer items-center gap-2.5 text-text-secondary">
          <span className="lg:hidden">Hide clean</span>
          <span className="hidden lg:inline">Hide clauses with no issue</span>
          <input type="checkbox" role="switch" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} className="peer sr-only" />
          <span className="relative h-5 w-[34px] rounded-full bg-border-strong transition-colors peer-checked:bg-risk-ok-solid peer-focus-visible:ring-2 peer-focus-visible:ring-brand-border after:absolute after:top-0.5 after:left-0.5 after:size-4 after:rounded-full after:bg-bg-surface after:transition-transform peer-checked:after:translate-x-3.5" />
        </label>
      </div>
      {rows.length === 0 && pendingCards === 0 && <p className="py-6 text-center text-sm text-text-tertiary">No findings yet.</p>}
      <ul className="flex flex-col gap-3">
        {rows.map((f) => {
          const selected = f.id === selectedId;
          const flagged = f.clauseId && (f.confidence === "low" || !f.citationVerified) && f.riskLevel !== "none";
          return (
            <li key={f.id} data-row={f.id} className="flex flex-col">
              <div
                className={`relative z-10 flex flex-col gap-2 rounded-[14px] border bg-bg-surface px-4 py-3.5 ${
                  selected ? "-mb-2.5 border-[1.5px] border-brand-solid shadow-card" : "border-border-default"
                }`}
              >
                <button type="button" onClick={() => onSelect(f.id)} className="flex w-full flex-col gap-2 text-left">
                  <span className="flex items-center gap-2.5">
                    <RiskBadge risk={f.riskLevel} />
                    <span className="font-mono text-xs leading-[18px] text-text-tertiary">{f.clauseId ? (f.clauseRef ?? "clause") : "missing clause"}</span>
                    {f.clauseId && f.citationVerified && <span className="text-xs leading-4 text-risk-ok-fg">✓ Quote verified</span>}
                    {flagged && (
                      <span className="text-xs leading-4 text-risk-medium-fg" title={f.citationVerified ? "Low confidence" : "Quote could not be verified in the clause"}>
                        {f.citationVerified ? "low confidence" : "⚠ unverified"}
                      </span>
                    )}
                  </span>
                  <span className="text-[15px] leading-[22px] font-medium tracking-[-0.1px]">{f.ruleName ?? "No matching rule"}</span>
                  {f.deviationReason && <span className="text-[13px] leading-5 text-text-secondary">{f.deviationReason}</span>}
                </button>
              </div>
              {selected && (
                <div className="flex flex-col gap-3 rounded-[14px] border border-brand-border bg-brand-subtle px-4 pt-[22px] pb-4">
                  {f.sourceSpan && (
                    <div className="flex flex-col gap-1.5 border-l-2 border-brand-solid py-0.5 pl-3">
                      <p className="font-mono text-[11px] leading-[14px] font-medium tracking-[0.8px] text-brand-text uppercase">Quoted from clause</p>
                      <p className="font-document text-[15px] leading-[22px]">“{f.sourceSpan}”</p>
                    </div>
                  )}
                  {/* TODO(design): Figma also has a "Copy suggested redline" button here. Findings do not store a redline yet. */}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowReasoning(showReasoning === f.id ? null : f.id)}
                      className="rounded-[10px] border border-border-strong bg-bg-surface px-3 py-[7px] text-sm leading-5 font-medium hover:bg-bg-canvas"
                    >
                      {showReasoning === f.id ? "Hide reasoning" : "Show reasoning"}
                    </button>
                  </div>
                  {showReasoning === f.id && <ReasoningPanel finding={f} />}
                </div>
              )}
            </li>
          );
        })}
        {Array.from({ length: pendingCards }, (_, i) => (
          <li key={`pending-${i}`} aria-hidden className="flex flex-col gap-2.5 rounded-[14px] border border-border-default bg-bg-surface px-4 py-3.5">
            <span className="h-4 w-20 rounded-full bg-bg-subtle" />
            <span className="h-3 w-3/5 rounded bg-bg-subtle" />
            <span className="h-3 w-[90%] rounded bg-bg-subtle" />
          </li>
        ))}
      </ul>
    </div>
  );
}

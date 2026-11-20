"use client";

import { useEffect, useRef } from "react";
import type { FindingView } from "@/lib/review/view";

/** Fallback when there is no PDF to render (DOCX uploads, or a stored file that can't be loaded). */
export function TextViewer({ findings, selectedId, onSelect }: { findings: FindingView[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedId) box.current?.querySelector(`[data-finding="${selectedId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedId]);
  return (
    <div ref={box} className="mx-auto my-7 flex w-full max-w-[640px] flex-col gap-3.5 rounded-md bg-bg-surface p-6 shadow-card lg:p-14">
      <p className="text-xs text-text-tertiary">Text view (no page layout available for this document).</p>
      {!findings.some((f) => f.clauseId) && <p className="py-6 text-center text-sm text-text-tertiary">Clauses appear here as they are reviewed.</p>}
      {findings
        .filter((f) => f.clauseId)
        .map((f) => {
          const sel = f.id === selectedId;
          const tone =
            f.riskLevel === "high"
              ? "border-risk-high-solid bg-risk-high-highlight"
              : f.riskLevel === "medium"
                ? "border-risk-medium-solid bg-risk-medium-highlight"
                : f.riskLevel === "low"
                  ? "border-risk-low-solid bg-risk-low-bg"
                  : "border-transparent";
          return (
            <div
              key={f.id}
              data-finding={f.id}
              onClick={() => onSelect(f.id)}
              className={`cursor-pointer rounded-md border px-2.5 py-1.5 font-document text-[15px] leading-6 whitespace-pre-wrap text-[#1b1a17] ${tone} ${
                sel ? "border-2 shadow-[0_4px_16px_rgba(229,71,77,0.35)]" : ""
              }`}
            >
              {f.clauseRef && <span className="mr-2 font-mono text-xs text-[#7d7869]">{f.clauseRef}</span>}
              {f.clauseText}
            </div>
          );
        })}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import type { FindingView } from "@/lib/review/view";
import { RISK_HIGHLIGHT } from "./RiskBadge";

/** Fallback when there is no PDF to render (DOCX uploads, or a stored file that can't be loaded). */
export function TextViewer({ findings, selectedId, onSelect }: { findings: FindingView[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (selectedId) box.current?.querySelector(`[data-finding="${selectedId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedId]);
  return (
    <div ref={box} className="flex flex-col gap-2">
      <p className="text-xs text-zinc-500">Text view (no page layout available for this document).</p>
      {findings
        .filter((f) => f.clauseId)
        .map((f) => {
          const c = RISK_HIGHLIGHT[f.riskLevel];
          const sel = f.id === selectedId;
          return (
            <div
              key={f.id}
              data-finding={f.id}
              onClick={() => onSelect(f.id)}
              className="cursor-pointer whitespace-pre-wrap rounded border-l-4 px-3 py-2 text-sm"
              style={{ background: c.fill, borderColor: f.riskLevel === "none" ? "transparent" : c.border, outline: sel ? `2px solid ${c.border}` : undefined }}
            >
              {f.clauseRef && <span className="mr-2 font-mono text-xs text-zinc-500">{f.clauseRef}</span>}
              {f.clauseText}
            </div>
          );
        })}
    </div>
  );
}

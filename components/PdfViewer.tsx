"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { bboxToRect, type FindingView } from "@/lib/review/view";
import { RISK_HIGHLIGHT } from "./RiskBadge";

// Must be set in the same module that renders <Document>. Version matches react-pdf's pdfjs-dist (see package.json).
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type Props = {
  fileUrl: string;
  findings: FindingView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onError: () => void;
};

export default function PdfViewer({ fileUrl, findings, selectedId, onSelect, onError }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [numPages, setNumPages] = useState(0);
  const [sizes, setSizes] = useState<Record<number, { w: number; h: number }>>({});

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    box.current?.querySelector(`[data-finding="${selectedId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedId, numPages, sizes]);

  const flagged = findings.filter((f) => f.riskLevel !== "none" && f.bbox?.length);

  return (
    <div ref={box} className="flex flex-col gap-4">
      <Document
        file={fileUrl}
        onLoadSuccess={(d) => setNumPages(d.numPages)}
        onLoadError={onError}
        onSourceError={onError}
        loading={<p className="p-4 text-sm text-zinc-500">Loading document…</p>}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNo) => {
          const size = sizes[pageNo];
          const scale = size ? width / size.w : 1;
          return (
            <div key={pageNo} className="relative mx-auto mb-4 shadow ring-1 ring-zinc-200 dark:ring-zinc-800" style={{ width }}>
              <Page
                pageNumber={pageNo}
                width={width}
                renderTextLayer={false}
                renderAnnotationLayer={false}
                onLoadSuccess={(p) => setSizes((s) => ({ ...s, [pageNo]: { w: p.originalWidth, h: p.originalHeight } }))}
              />
              {size &&
                flagged.flatMap((f) =>
                  f.bbox!
                    .filter((b) => b.page === pageNo)
                    .map((b, i) => {
                      const r = bboxToRect(b, size.h, scale);
                      const sel = f.id === selectedId;
                      const c = RISK_HIGHLIGHT[f.riskLevel];
                      return (
                        <div
                          key={`${f.id}-${i}`}
                          data-finding={f.id}
                          onClick={() => onSelect(f.id)}
                          title={`${f.clauseRef ?? ""} · ${f.riskLevel}`}
                          className="absolute cursor-pointer rounded-sm transition-shadow"
                          style={{
                            ...r,
                            background: c.fill,
                            border: `${sel ? 2 : 1}px solid ${c.border}`,
                            boxShadow: sel ? `0 0 0 3px ${c.fill}` : undefined,
                          }}
                        />
                      );
                    }),
                )}
            </div>
          );
        })}
      </Document>
    </div>
  );
}

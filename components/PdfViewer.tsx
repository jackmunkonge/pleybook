"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { bboxToRect, HIGHLIGHT_PAD, type FindingView } from "@/lib/review/view";
import { RISK_HIGHLIGHT } from "./RiskBadge";
import { DocLoading } from "./Skeleton";

// Must be set in the same module that renders <Document>. Version matches react-pdf's pdfjs-dist (see package.json).
pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

type Props = {
  fileUrl: string;
  findings: FindingView[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onError: () => void;
};

const PAGE_WIDTH = 640;
const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];

export default function PdfViewer({ fileUrl, findings, selectedId, onSelect, onError }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [avail, setAvail] = useState(PAGE_WIDTH);
  const [zoom, setZoom] = useState(1);
  const [page, setPage] = useState(1);
  const [numPages, setNumPages] = useState(0);
  const [sizes, setSizes] = useState<Record<number, { w: number; h: number }>>({});
  // At 100% a page is 640px wide (as designed), shrinking to fit narrow screens.
  const width = Math.floor(Math.min(PAGE_WIDTH, avail) * zoom);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAvail(Math.max(260, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    box.current?.querySelector(`[data-finding="${selectedId}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedId, numPages, sizes]);

  // Track the page nearest the top of the scrolling parent for the "1 / 3" indicator.
  useEffect(() => {
    // The scrolling ancestor is the section on desktop and an inner wrapper on mobile.
    let scroller: HTMLElement | null = box.current?.parentElement ?? null;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (!scroller) return;
    const el = scroller;
    const onScroll = () => {
      const top = el.getBoundingClientRect().top + el.clientHeight / 3;
      const pages = Array.from(box.current?.querySelectorAll<HTMLElement>("[data-page]") ?? []);
      const current = pages.filter((p) => p.getBoundingClientRect().top <= top).length;
      setPage(Math.max(1, current));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [numPages]);

  const goTo = (n: number) => {
    const target = Math.min(Math.max(1, n), Math.max(1, numPages));
    box.current?.querySelector(`[data-page="${target}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPage(target);
  };
  const step = (dir: 1 | -1) => {
    const i = ZOOM_STEPS.indexOf(zoom);
    setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, i + dir))]);
  };

  const flagged = findings.filter((f) => f.riskLevel !== "none" && f.bbox?.length);
  const selected = flagged.find((f) => f.id === selectedId);

  return (
    <div ref={box} className="flex flex-col items-center gap-5 px-4 pt-7 pb-24">
      <Document
        file={fileUrl}
        onLoadSuccess={(d) => setNumPages(d.numPages)}
        onLoadError={onError}
        onSourceError={onError}
        loading={<DocLoading />}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNo) => {
          const size = sizes[pageNo];
          const scale = size ? width / size.w : 1;
          return (
            <div key={pageNo} data-page={pageNo} className="relative mx-auto mb-5 overflow-hidden rounded-md bg-white shadow-card" style={{ width }}>
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
                      const r = bboxToRect(b, size.h, scale, HIGHLIGHT_PAD);
                      const sel = f.id === selectedId;
                      const c = RISK_HIGHLIGHT[f.riskLevel];
                      return (
                        <div
                          key={`${f.id}-${i}`}
                          data-finding={f.id}
                          onClick={() => onSelect(f.id)}
                          title={`${f.clauseRef ?? ""} · ${f.riskLevel}`}
                          className="absolute cursor-pointer rounded-md transition-shadow"
                          style={{
                            ...r,
                            background: c.fill,
                            border: `${sel ? 2 : 1}px solid ${c.border}`,
                            boxShadow: sel ? `0 4px 16px ${c.fill}` : undefined,
                          }}
                        >
                          {sel && i === 0 && (
                            <span className="pointer-events-none absolute -top-7 right-2 flex items-center gap-1.5 rounded-md bg-bg-inverse py-1 pr-2.5 pl-2 whitespace-nowrap text-text-inverse">
                              <span className="font-mono text-[11px] leading-[14px] font-medium tracking-[0.8px] uppercase">{selected?.clauseRef ?? ""}</span>
                              <span className="text-xs leading-4">{selected?.ruleName}</span>
                            </span>
                          )}
                        </div>
                      );
                    }),
                )}
            </div>
          );
        })}
      </Document>

      {numPages > 0 && (
        <div className="sticky bottom-5 z-10 flex items-center gap-3.5 rounded-full border border-border-default bg-bg-surface px-3.5 py-2 shadow-floating">
          <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => goTo(page - 1)} className="disabled:opacity-40">
            <ToolbarIcon src="/ui/chev-left.svg" />
          </button>
          <span className="font-mono text-xs leading-[18px]">
            {page} / {numPages}
          </span>
          <button type="button" aria-label="Next page" disabled={page >= numPages} onClick={() => goTo(page + 1)} className="disabled:opacity-40">
            <ToolbarIcon src="/ui/chev-right.svg" />
          </button>
          <span className="h-4 w-px bg-border-strong" />
          <button type="button" aria-label="Zoom out" disabled={zoom <= ZOOM_STEPS[0]} onClick={() => step(-1)} className="disabled:opacity-40">
            <ToolbarIcon src="/ui/minus.svg" />
          </button>
          <span className="w-9 text-center font-mono text-xs leading-[18px]">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" disabled={zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]} onClick={() => step(1)} className="disabled:opacity-40">
            <ToolbarIcon src="/ui/plus.svg" />
          </button>
        </div>
      )}
    </div>
  );
}

/** Masked so the stroke follows the text colour and stays readable in dark mode. */
function ToolbarIcon({ src }: { src: string }) {
  return (
    <span
      aria-hidden
      className="block size-4 bg-text-secondary"
      style={{ mask: `url(${src}) center / contain no-repeat`, WebkitMask: `url(${src}) center / contain no-repeat` }}
    />
  );
}

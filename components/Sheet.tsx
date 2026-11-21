"use client";

import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";

/** Swipe-down-to-dismiss for a bottom drawer. Spread `handlers` on the grabber/header; apply `style` to the drawer. */
export function useSheetDrag(onClose: () => void) {
  const start = useRef<number | null>(null);
  const [dy, setDy] = useState(0);
  const handlers = {
    onPointerDown: (e: PointerEvent) => {
      start.current = e.clientY;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    onPointerMove: (e: PointerEvent) => {
      if (start.current !== null) setDy(Math.max(0, e.clientY - start.current));
    },
    onPointerUp: () => {
      if (start.current === null) return;
      start.current = null;
      if (dy > 100) onClose();
      setDy(0);
    },
    onPointerCancel: () => {
      start.current = null;
      setDy(0);
    },
  };
  const style = dy ? { transform: `translateY(${dy}px)`, transition: "none" } : undefined;
  return { handlers, style, dragging: dy > 0 };
}

export function Grabber({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`mx-auto block h-1 w-10 shrink-0 rounded-full bg-border-strong ${className}`} />;
}

/**
 * A native-feeling bottom drawer below `lg` (iOS/Android style: backdrop, grabber, swipe down or tap outside to
 * dismiss, scrollable body, sticky footer). From `lg` up it renders inline as a plain card.
 */
export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const { handlers, style } = useSheetDrag(onClose);

  // Lock page scroll behind the drawer (below lg only) and close on Escape.
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023.98px)");
    const prev = document.body.style.overflow;
    if (mq.matches) document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div className="max-lg:fixed max-lg:inset-0 max-lg:z-50 max-lg:flex max-lg:items-end">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="sheet-fade absolute inset-0 bg-black/40 lg:hidden" />
      <div
        role="dialog"
        aria-label={title}
        style={style}
        className="sheet-up relative flex w-full flex-col overflow-hidden bg-bg-surface max-lg:max-h-[92dvh] max-lg:rounded-t-3xl max-lg:shadow-floating lg:rounded-2xl lg:border lg:border-border-strong lg:shadow-card"
      >
        <div {...handlers} className="shrink-0 cursor-grab touch-none px-4 pt-2.5 pb-1 lg:hidden">
          <Grabber />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 max-lg:pt-1 lg:p-6">{children}</div>
        {footer && <div className="shrink-0 border-t border-border-default bg-bg-surface px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] lg:border-0 lg:px-6 lg:pt-0 lg:pb-6">{footer}</div>}
      </div>
    </div>
  );
}

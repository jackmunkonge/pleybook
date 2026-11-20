"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

export function UploadPanel({ reviewsLeft }: { reviewsLeft: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [navigating, startNavigation] = useTransition();

  // Next keeps this page mounted while you are on a review, so "busy" must be cleared before navigating away
  // or it is still showing when you come back. The transition keeps the buttons disabled only while the navigation is pending.
  const go = (url: string) => {
    setBusy(null);
    startNavigation(() => router.push(url));
  };

  // Wake the (auto-suspending) database while the user is choosing a file.
  useEffect(() => {
    void fetch("/api/health").catch(() => {});
  }, []);

  async function start(getDocument: () => Promise<Response>) {
    setError(null);
    try {
      setBusy("Reading and indexing the contract…");
      const docRes = await getDocument();
      const doc = await docRes.json().catch(() => null);
      if (!docRes.ok) throw new Error(doc?.error ?? `Upload failed (${docRes.status})`);

      // The sample route returns the existing review when there is one: open it rather than starting (and paying for) a new run.
      if (doc.reviewId) {
        go(`/review/${doc.reviewId}`);
        return;
      }

      setBusy("Starting review…");
      const revRes = await fetch("/api/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      });
      const rev = await revRes.json().catch(() => null);
      if (!revRes.ok) throw new Error(rev?.error ?? `Could not start review (${revRes.status})`);
      go(`/review/${rev.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setBusy(null);
    }
  }

  const upload = (file: File) => {
    const body = new FormData();
    body.set("file", file);
    return start(() => fetch("/api/documents", { method: "POST", body }));
  };

  const outOfReviews = reviewsLeft <= 0;
  const working = !!busy || navigating;
  const disabled = working || outOfReviews;
  const [dragging, setDragging] = useState(false);
  return (
    <div className="flex w-full flex-col gap-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files?.[0];
          if (file && !disabled) void upload(file);
        }}
        className={`flex flex-col items-center gap-3.5 rounded-[20px] border-[1.5px] border-dashed p-5 shadow-card transition-colors lg:flex-row lg:gap-5 lg:p-7 ${
          dragging ? "border-brand-text bg-brand-subtle" : "border-brand-border bg-bg-surface"
        }`}
      >
        <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-brand-subtle lg:size-[60px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ui/icon-upload.svg" alt="" width={26} height={26} className="size-6 lg:size-[26px]" />
        </div>
        <div className="flex flex-col items-center gap-0.5 lg:flex-1 lg:items-start">
          <p className="text-[15px] leading-[22px] font-medium tracking-[-0.1px]">
            <span className="hidden lg:inline">Drop a contract here</span>
            <span className="lg:hidden">Add a contract</span>
          </p>
          <p className="text-[13px] leading-5 text-text-secondary">Text PDF or DOCX, up to 10 MB</p>
        </div>
        <input
          ref={input}
          type="file"
          accept=".pdf,.docx"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => input.current?.click()}
          disabled={disabled}
          className="w-full rounded-[10px] bg-brand-solid px-4 py-2.5 text-sm leading-5 font-medium text-brand-on-solid hover:opacity-90 disabled:opacity-50 lg:w-auto"
        >
          Choose file
        </button>
        <button
          id="try-sample"
          onClick={() => void start(() => fetch("/api/documents/sample", { method: "POST" }))}
          disabled={disabled}
          className="w-full rounded-[10px] border border-border-strong bg-bg-surface px-4 py-2.5 text-sm leading-5 font-medium hover:bg-bg-canvas disabled:opacity-50 lg:w-auto"
        >
          Try the sample MSA
        </button>
      </div>
      {working && (
        <p role="status" className="text-sm text-text-secondary">
          {busy ?? "Opening review…"}
        </p>
      )}
      {outOfReviews && !working && (
        <p role="alert" className="text-sm text-risk-medium-fg">
          You have used all of today&apos;s reviews. They free up 24 hours after each one starts.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-risk-high-fg">
          {error}
        </p>
      )}
    </div>
  );
}

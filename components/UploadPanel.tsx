"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function UploadPanel({ reviewsLeft }: { reviewsLeft: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        router.push(`/review/${doc.reviewId}`);
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
      router.push(`/review/${rev.id}`);
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
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-lg border border-dashed border-zinc-300 p-6 dark:border-zinc-700 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="font-medium">Upload a contract</p>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">Text PDF or DOCX, up to 10 MB.</p>
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
          disabled={!!busy || outOfReviews}
          className="rounded bg-black px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          Choose file
        </button>
        <button
          onClick={() => void start(() => fetch("/api/documents/sample", { method: "POST" }))}
          disabled={!!busy || outOfReviews}
          className="rounded border border-zinc-300 px-4 py-2 text-sm disabled:opacity-50 dark:border-zinc-700"
        >
          Try the sample MSA
        </button>
      </div>
      {busy && (
        <p role="status" className="text-sm text-zinc-600 dark:text-zinc-400">
          {busy}
        </p>
      )}
      {outOfReviews && !busy && (
        <p role="alert" className="text-sm text-amber-700 dark:text-amber-400">
          You have used all of today&apos;s reviews. They free up 24 hours after each one starts.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}

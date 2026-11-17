import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { UploadPanel } from "@/components/UploadPanel";
import { getSession } from "@/lib/auth-guard";
import { recentReviews, reviewsLeftToday } from "@/lib/review/job";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Review a contract against your playbook</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          Pleybook splits a contract into clauses, finds the playbook rule that applies to each, and flags deviations
          with a quote you can check in the document.
        </p>
      </header>
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
        <Dashboard />
      </Suspense>
    </main>
  );
}

async function Dashboard() {
  const session = await getSession();
  if (!session) redirect("/login");
  const [{ left, limit }, recent] = await Promise.all([reviewsLeftToday(session.user.id), recentReviews(session.user.id)]);
  return (
    <>
      <UploadPanel reviewsLeft={left} />
      <p className="-mt-4 text-xs text-zinc-500">
        {left} of {limit} reviews left today.
      </p>
      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Recent reviews</h2>
          <ul className="divide-y divide-zinc-200 rounded border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {recent.map((r) => (
              <li key={r.id}>
                <Link href={`/review/${r.id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900">
                  <span className="truncate">{r.filename}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {r.status === "completed" ? `${r.totalClauses} clauses` : r.status} · {r.startedAt.toLocaleDateString("en-GB")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

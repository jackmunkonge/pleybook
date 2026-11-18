import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EvalDashboard } from "@/components/EvalDashboard";
import { getSession } from "@/lib/auth-guard";
import { loadRuns } from "@/lib/eval/results";

export const metadata = { title: "Evaluation · Pleybook" };

export default function EvalPage() {
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
          <Results />
        </Suspense>
      </div>
    </main>
  );
}

async function Results() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <EvalDashboard runs={loadRuns()} />;
}

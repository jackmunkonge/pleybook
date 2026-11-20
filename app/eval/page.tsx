import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EvalSkeleton } from "@/components/Skeleton";
import { EvalDashboard } from "@/components/EvalDashboard";
import { getSession } from "@/lib/auth-guard";
import { loadRuns } from "@/lib/eval/results";

export const metadata = { title: "Evaluation · Pleybook" };

export default function EvalPage() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg-canvas text-text-primary">
      <div className="mx-auto w-full max-w-[1440px] px-5 pt-7 pb-10 lg:px-20 lg:pt-16 lg:pb-20">
        <Suspense fallback={<EvalSkeleton />}>
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

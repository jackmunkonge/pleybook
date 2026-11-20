import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PlaybookEditor } from "@/components/PlaybookEditor";
import { Skeleton } from "@/components/Skeleton";
import { getSession } from "@/lib/auth-guard";
import { listPlaybook } from "@/lib/playbook/store";

export const metadata = { title: "Playbook · Pleybook" };

export default function PlaybookPage() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg-canvas text-text-primary">
      <div className="mx-auto w-full max-w-[1440px] px-5 pt-7 pb-10 lg:px-20 lg:pt-14 lg:pb-20">
        <Suspense fallback={<PlaybookSkeleton />}>
          <Rules />
        </Suspense>
      </div>
    </main>
  );
}

async function Rules() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { custom, rules } = await listPlaybook(session.user.id);
  return <PlaybookEditor initialRules={rules} initialCustom={custom} />;
}

function PlaybookSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <span role="status" className="sr-only">
        Loading playbook
      </span>
      <Skeleton className="h-[120px] w-full max-w-[640px]" />
      <Skeleton className="h-10 w-full rounded-xl" />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-[72px] w-full rounded-[14px]" />
      ))}
    </div>
  );
}

import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { ReviewWorkspace } from "@/components/ReviewWorkspace";
import { getSession } from "@/lib/auth-guard";
import { getReviewState, ReviewError } from "@/lib/review/job";

export const metadata = { title: "Review · Pleybook" };

export default function ReviewPage({ params }: PageProps<"/review/[id]">) {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-zinc-500">Loading review…</p>}>
      <Loader params={params} />
    </Suspense>
  );
}

async function Loader({ params }: { params: PageProps<"/review/[id]">["params"] }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect("/login");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const state = await getReviewState(id, session.user.id).catch((e) => {
    if (e instanceof ReviewError && e.status === 404) notFound();
    throw e;
  });
  return <ReviewWorkspace initial={state} />;
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DashboardSkeleton } from "@/components/Skeleton";
import { RiskBadge } from "@/components/RiskBadge";
import { UploadPanel } from "@/components/UploadPanel";
import { EmptyReviews } from "@/components/EmptyReviews";
import { getSession } from "@/lib/auth-guard";
import { recentReviews, reviewsLeftToday } from "@/lib/review/job";

const STEPS = [
  { title: "Scan the document", mobileTitle: "Read the document", body: "We pull out the text and remember where every line sits on the page." },
  { title: "Split it into clauses", body: "Each numbered clause is separated so it can be judged on its own." },
  { title: "Find the matching rule", body: "Every clause is matched to the part of your playbook that applies to it." },
  { title: "Flag what doesn’t fit", body: "An AI model compares clause and rule, and explains any gap in plain words." },
  { title: "Double-check the quotes", body: "Plain code confirms each quoted line really appears in your contract." },
];

export default function Home() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-bg-canvas text-text-primary">
      <Suspense fallback={<DashboardSkeleton />}>
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
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-5 pt-7 pb-10 lg:gap-14 lg:px-20 lg:pt-[72px] lg:pb-20">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-12">
        <div className="flex flex-col items-start gap-6 lg:flex-[700] lg:gap-7">
          <span className="flex items-center gap-1.5 rounded-full border border-brand-border bg-brand-subtle py-1 pr-3 pl-2.5 lg:gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ui/icon-spark.svg" alt="" width={12} height={12} />
            <span className="font-mono text-[11px] leading-[14px] font-medium tracking-[0.8px] text-brand-text uppercase">AI contract review</span>
          </span>
          <h1 className="display-axes font-display text-[38px] leading-[42px] font-light tracking-[-1.2px] lg:text-[60px] lg:leading-[66px] lg:tracking-[-2px]">
            Review a contract against <em className="text-brand-text">your playbook</em>.
          </h1>
          <p className="text-sm leading-[22px] text-text-secondary">
            Pleybook splits a contract into clauses, finds the rule that applies to each, and flags deviations with a quote you can check in the document.
          </p>
          <UploadPanel reviewsLeft={left} />
          <div className="flex items-center gap-2.5 lg:gap-3">
            <div className="flex gap-1" aria-hidden>
              {Array.from({ length: limit }, (_, i) => (
                <span key={i} className={`h-1.5 w-6 rounded-[3px] lg:w-7 ${i < left ? "bg-brand-solid" : "bg-bg-subtle"}`} />
              ))}
            </div>
            <p className="text-xs leading-4 text-text-secondary">
              {left} of {limit} reviews left today
            </p>
          </div>
        </div>
        <Pipeline />
      </div>
      {recent.length === 0 && <EmptyReviews />}
      {recent.length > 0 && (
        <section className="flex flex-col gap-3 lg:gap-4">
          {/* TODO(design): Figma shows a "View all" link beside this heading. Add it once there is a full reviews list page. */}
          <h2 className="text-xl leading-[26px] font-semibold tracking-[-0.3px]">Recent reviews</h2>
          <ul className="flex flex-col gap-3 lg:gap-0 lg:divide-y lg:divide-border-default lg:overflow-hidden lg:rounded-2xl lg:border lg:border-border-default lg:bg-bg-surface lg:shadow-card">
            {recent.map((r) => {
              const done = r.status === "completed";
              return (
                <li key={r.id}>
                  <Link
                    href={`/review/${r.id}`}
                    className="flex items-center gap-3 rounded-[14px] border border-border-default bg-bg-surface p-3.5 hover:bg-bg-canvas lg:gap-4 lg:rounded-none lg:border-0 lg:px-6 lg:py-[18px]"
                  >
                    <span className="hidden size-10 shrink-0 items-center justify-center rounded-[10px] bg-bg-subtle lg:flex">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="/ui/icon-file.svg" alt="" width={20} height={20} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm leading-[22px] font-medium">{r.filename}</span>
                      <span className="text-xs leading-4 text-text-secondary">
                        {done ? (
                          <>
                            {r.totalClauses} clauses · {r.deviations} deviations
                            <span className="hidden lg:inline"> · {r.missing} missing</span>
                          </>
                        ) : r.status === "running" || r.status === "pending" ? (
                          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium capitalize">
                            <span className="size-2 animate-pulse rounded-full bg-brand-solid shadow-[0_0_8px_var(--brand-solid)]" />
                            <span className="text-shimmer">{r.status === "running" ? "Reviewing…" : "Queued"}</span>
                          </span>
                        ) : (
                          r.status
                        )}
                      </span>
                    </span>
                    {done && r.topRisk && <RiskBadge risk={r.topRisk} />}
                    <span className="hidden w-[110px] shrink-0 text-right text-xs leading-4 text-text-tertiary lg:block">{when(r.startedAt)}</span>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/ui/icon-chev.svg" alt="" width={18} height={18} className="hidden shrink-0 lg:block" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function Pipeline() {
  return (
    <section className="flex w-full flex-col gap-0.5 rounded-[20px] border border-border-default bg-bg-surface p-5 text-text-primary shadow-floating lg:flex-[484] lg:gap-1 lg:p-7">
      <p className="font-mono text-[11px] leading-[14px] font-medium tracking-[0.8px] text-text-tertiary uppercase">What happens next</p>
      <h2 className="text-xl leading-[26px] font-semibold tracking-[-0.3px]">How your contract is reviewed</h2>
      <ol className="mt-2.5 flex flex-col lg:mt-5">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex items-start gap-3.5 py-2.5 lg:py-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-text-tertiary font-mono text-xs leading-[18px]">{i + 1}</span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm leading-[22px] font-medium">
                {s.mobileTitle ? (
                  <>
                    <span className="hidden lg:inline">{s.title}</span>
                    <span className="lg:hidden">{s.mobileTitle}</span>
                  </>
                ) : (
                  s.title
                )}
              </p>
              <p className="text-xs leading-4 text-text-tertiary">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function when(d: Date) {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days < 1 && new Date().getDate() === d.getDate()) return `Today, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
  if (days <= 1) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

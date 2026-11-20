/** Pulsing placeholder block. Size and shape come from className. Pulse is disabled for reduced-motion users. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-bg-subtle motion-reduce:animate-none ${className}`} />;
}

function Status({ label }: { label: string }) {
  return (
    <span role="status" className="sr-only">
      {label}
    </span>
  );
}

/** Home page: hero copy + upload panel on the left, pipeline card on the right, then the recent reviews list. */
export function DashboardSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-5 pt-7 pb-10 lg:gap-14 lg:px-20 lg:pt-[72px] lg:pb-20">
      <Status label="Loading reviews" />
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-12">
        <div className="flex flex-col items-start gap-6 lg:flex-[700] lg:gap-7">
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="h-[84px] w-full max-w-[560px] lg:h-[132px]" />
          <Skeleton className="h-11 w-full max-w-[520px]" />
          <Skeleton className="h-[120px] w-full rounded-2xl" />
        </div>
        <Skeleton className="h-[300px] w-full rounded-[20px] lg:h-[420px] lg:flex-[484]" />
      </div>
      <div className="flex flex-col gap-3 lg:gap-4">
        <Skeleton className="h-6 w-40" />
        <div className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[66px] w-full rounded-[14px] lg:h-[74px]" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Eval page: a stack of metric cards. */
export function EvalSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Status label="Loading evaluation" />
      <Skeleton className="h-10 w-72" />
      <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[200px] w-full rounded-2xl" />
        ))}
      </div>
    </div>
  );
}

/** Review page: document pane beside the findings pane (stacked on mobile). */
export function ReviewSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      <Status label="Loading review" />
      <div className="flex flex-1 justify-center bg-bg-subtle px-4 pt-7 lg:min-h-0">
        <Skeleton className="h-[480px] w-full max-w-[640px] rounded-md bg-bg-surface lg:h-[720px]" />
      </div>
      <div className="flex flex-col gap-3 border-border-default bg-bg-surface p-5 lg:w-[480px] lg:border-l lg:p-6">
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[72px] w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

/** Paper-shaped placeholder shown while the PDF viewer code or the PDF itself loads. */
export function DocLoading() {
  return (
    <div className="flex justify-center px-4 pt-7">
      <Status label="Loading document" />
      <Skeleton className="aspect-[8.5/11] w-full max-w-[640px] bg-bg-surface" />
    </div>
  );
}

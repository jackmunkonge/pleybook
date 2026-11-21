import Link from "next/link";
import { getSession } from "@/lib/auth-guard";
import { reviewsLeftToday } from "@/lib/review/job";
import { NavLinks, UserMenu } from "./user-menu";

/** Reads the session at request time; render inside <Suspense> (Cache Components). */
export async function UserBar() {
  const session = await getSession();
  if (!session) return null;
  const { left, limit } = await reviewsLeftToday(session.user.id);
  const name = session.user.displayUsername ?? session.user.username ?? session.user.name;
  return (
    <header className="relative z-20 flex shrink-0 items-center gap-2.5 border-b border-border-default bg-bg-surface px-5 py-3.5 lg:h-[60px] lg:gap-8 lg:px-8 lg:py-0">
      <Link href="/" className="flex flex-1 items-center gap-2.5 lg:flex-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ui/mark.svg" alt="" width={22} height={19} className="dark:invert" />
        <span className="text-[15px] leading-[22px] font-medium tracking-[-0.1px] max-lg:sr-only">Pleybook</span>
      </Link>
      <NavLinks className="hidden lg:flex" />
      <div className="hidden flex-1 lg:block" />
      <span className="hidden items-center gap-2 rounded-full border border-border-default py-[5px] pr-3 pl-3 text-xs leading-4 text-text-secondary lg:flex">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ui/dot-ok.svg" alt="" width={6} height={6} className="order-first" />
        {left} of {limit} reviews left today
      </span>
      <UserMenu name={name} left={left} limit={limit} />
    </header>
  );
}

import Link from "next/link";
import { Logo } from "@/components/Logo";
import { getSession } from "@/lib/auth-guard";
import { reviewsLeftToday } from "@/lib/review/job";
import { SignOutButton } from "./sign-out-button";

/** Reads the session at request time; render inside <Suspense> (Cache Components). */
export async function UserBar() {
  const session = await getSession();
  if (!session) return null;
  const { left, limit } = await reviewsLeftToday(session.user.id);
  return (
    <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-4 py-2 text-sm dark:border-zinc-800">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <Logo className="h-5 w-auto" />
        Pleybook
      </Link>
      <div className="flex items-center gap-3">
        <span className="hidden text-xs text-zinc-500 sm:inline">
          {left} of {limit} reviews left today
        </span>
        <span>{session.user.displayUsername ?? session.user.username ?? session.user.name}</span>
        <SignOutButton />
      </div>
    </div>
  );
}

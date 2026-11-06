import { getSession } from "@/lib/auth-guard";
import { SignOutButton } from "./sign-out-button";

/** Reads the session at request time; render inside <Suspense> (Cache Components). */
export async function UserBar() {
  const session = await getSession();
  if (!session) return null;
  return (
    <div className="flex items-center justify-end gap-3 px-4 py-2 text-sm">
      <span>{session.user.displayUsername ?? session.user.username ?? session.user.name}</span>
      <SignOutButton />
    </div>
  );
}

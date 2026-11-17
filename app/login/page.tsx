"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const form = new FormData(e.currentTarget);
    const { error } = await authClient.signIn.username({
      username: String(form.get("username") ?? ""),
      password: String(form.get("password") ?? ""),
    });
    setPending(false);
    if (error) {
      setError(error.status === 429 ? "Too many attempts. Try again in a minute." : "Invalid username or password.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
        <Logo className="h-12 w-auto self-start" />
        <h1 className="text-2xl font-semibold">Sign in to Pleybook</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Invite-only demo. Use the credentials you were given.</p>
        <label className="flex flex-col gap-1 text-sm">
          Username
          <input name="username" autoComplete="username" required className="rounded border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input name="password" type="password" autoComplete="current-password" required className="rounded border border-zinc-300 bg-transparent px-3 py-2 dark:border-zinc-700" />
        </label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={pending} className="rounded bg-black px-3 py-2 text-white disabled:opacity-60 dark:bg-white dark:text-black">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/auth-client";

const LINKS = [
  { href: "/", label: "Reviews", match: (p: string) => p === "/" || p.startsWith("/review") },
  { href: "/playbook", label: "Playbook", match: (p: string) => p.startsWith("/playbook") },
  { href: "/eval", label: "Evaluation", match: (p: string) => p.startsWith("/eval") },
];

export function NavLinks({ className = "", onNavigate, stacked = false }: { className?: string; onNavigate?: () => void; stacked?: boolean }) {
  const pathname = usePathname();
  return (
    <nav className={`${stacked ? "flex-col" : ""} gap-1 ${className}`}>
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          onClick={onNavigate}
          className={`rounded-lg px-3 py-1.5 text-sm leading-[22px] font-medium ${
            l.match(pathname) ? "bg-bg-subtle text-text-primary" : "text-text-secondary hover:text-text-primary"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

/** Avatar (desktop) / hamburger (mobile) that opens one menu: page links on mobile, account + sign out everywhere. */
export function UserMenu({ name, left, limit }: { name: string; left: number; limit: number }) {
  const router = useRouter();
  const pathname = usePathname();
  // The menu is open only for the page it was opened on, so navigating closes it without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => setOpenAt((cur) => ((typeof v === "function" ? v(cur === pathname) : v) ? pathname : null));
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const initials = name.replace(/[^a-zA-Z0-9 ._-]/g, "").split(/[ ._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("") || "?";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpenAt(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenAt(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label="Account menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex size-8 items-center justify-center rounded-2xl bg-brand-subtle font-mono text-[11px] leading-[14px] font-medium tracking-[0.8px] text-brand-text uppercase max-lg:hidden"
      >
        {initials}
      </button>
      <button type="button" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex size-10 -mr-2 items-center justify-center lg:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ui/icon-menu.svg" alt="" width={22} height={22} className="dark:invert" />
      </button>
      {open && (
        <div className="absolute top-[calc(100%+12px)] right-0 flex w-56 flex-col gap-1 rounded-2xl border border-border-default bg-bg-surface p-2 shadow-floating">
          <p className="truncate px-3 py-1.5 text-xs leading-4 text-text-tertiary">Signed in as {name}</p>
          <p className="flex items-center gap-2 px-3 py-1.5 text-xs leading-4 text-text-secondary lg:hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ui/dot-ok.svg" alt="" width={6} height={6} />
            {left} of {limit} reviews left today
          </p>
          <NavLinks stacked className="flex lg:hidden" onNavigate={() => setOpenAt(null)} />
          <button
            type="button"
            disabled={signingOut}
            className="rounded-lg px-3 py-1.5 text-left text-sm leading-[22px] font-medium text-text-secondary hover:bg-bg-subtle hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
            onClick={async () => {
              setSigningOut(true);
              try {
                await authClient.signOut();
                router.replace("/login");
                router.refresh();
              } catch {
                setSigningOut(false);
              }
            }}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

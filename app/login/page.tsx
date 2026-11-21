"use client";

import { ContractScan } from "@/components/ContractScan";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "next/navigation";
import { useState } from "react";

const displayStyle = { fontVariationSettings: '"SOFT" 0, "WONK" 1' } as const;

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
    <main className="force-light flex min-h-0 flex-1 flex-col overflow-y-auto bg-bg-canvas text-text-primary lg:flex-row lg:overflow-hidden">
      <BrandPanel />
      <section className="flex flex-1 flex-col items-center justify-center p-7 lg:min-w-0 lg:basis-0 lg:px-6 lg:py-12">
        <form onSubmit={onSubmit} className="flex w-full max-w-[380px] flex-col items-start gap-4 lg:gap-5">
          <span className="rounded-full border border-brand-border bg-brand-subtle py-1 pr-3 pl-2.5 font-mono text-[11px] leading-3.5 font-medium tracking-[0.8px] text-brand-text uppercase">
            Invite-only demo
          </span>
          <h1
            className="text-[28px] leading-[34px] font-semibold tracking-[-0.6px] lg:font-display lg:text-[42px] lg:leading-12 lg:font-light lg:tracking-[-1.2px] lg:[font-variation-settings:'SOFT'_0,'WONK'_1]"
          >
            Welcome
          </h1>
          <p className="hidden text-sm leading-[22px] text-text-secondary lg:block">
            Sign in with the credentials you were given to review a contract against your playbook.
          </p>
          <label className="flex w-full flex-col gap-1.5 text-sm leading-[22px] font-medium">
            Username
            <input
              name="username"
              autoComplete="username"
              placeholder="e.g. guest-reviewer"
              required
              className="rounded-[10px] border border-border-strong bg-bg-surface px-3.5 py-3 font-normal text-text-primary outline-none placeholder:text-text-tertiary focus-visible:border-brand-text focus-visible:ring-2 focus-visible:ring-brand-border"
            />
          </label>
          <label className="flex w-full flex-col gap-1.5 text-sm leading-[22px] font-medium">
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••••"
              required
              className="rounded-[10px] border border-border-strong bg-bg-surface px-3.5 py-3 font-normal text-text-primary outline-none placeholder:text-text-tertiary focus-visible:border-brand-text focus-visible:ring-2 focus-visible:ring-brand-border"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-risk-high-fg">
              {error}
            </p>
          )}
          <button
            disabled={pending}
            className="w-full rounded-[10px] bg-brand-solid px-4 py-2.5 text-sm leading-5 font-medium text-brand-on-solid shadow-glow-brand transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-xs leading-4 text-text-tertiary">No account? Ask the author for a guest login.</p>
        </form>
      </section>
    </main>
  );
}

function BrandPanel() {
  return (
    <aside className="relative flex shrink-0 flex-col gap-5 overflow-hidden bg-bg-inverse p-7 text-text-inverse lg:min-w-0 lg:flex-1 lg:basis-0 lg:justify-between lg:gap-0 lg:px-14 lg:py-12">
      {/* Desktop: the animated "contract scan" WebGL scene fills the panel. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden lg:block">
        <ContractScan />
      </div>
      {/* Mobile: soft green glow instead of the scene. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/login/glow.svg" alt="" aria-hidden className="pointer-events-none absolute top-10 left-[170px] size-[440px] max-w-none -translate-x-[90px] -translate-y-[90px] lg:hidden" />

      <div className="relative flex items-center gap-2.5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/login/mark.svg" alt="" width={22} height={19} />
        <span className="text-[15px] leading-[22px] font-medium tracking-[-0.1px]">Pleybook</span>
      </div>

      <PlaybookMatch />

      <div className="relative flex flex-col gap-5 lg:gap-6">
        <p className="font-display text-[34px] leading-[38px] font-light tracking-[-1.2px] lg:text-[42px] lg:leading-12" style={displayStyle}>
          Every clause, checked against <em className="text-brand-border">your playbook</em>.
        </p>
        <ul className="flex items-center gap-3.5 lg:gap-7">
          <Stat value="Minutes">
            not hours,
            <br />
            per contract
          </Stat>
          <li aria-hidden className="h-6.5 w-px bg-text-inverse/20 lg:h-11" />
          <Stat value="100%">
            of cited quotes
            <br />
            verified
          </Stat>
        </ul>
      </div>
    </aside>
  );
}

function Stat({ value, children }: { value: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2 lg:gap-3">
      <span className="font-display text-[20px] leading-6 font-light tracking-[-0.6px] text-brand-border lg:text-[44px] lg:leading-12 lg:tracking-[-1.3px]" style={displayStyle}>
        {value}
      </span>
      <span className="text-[11px] leading-3.5 text-text-inverse/70 lg:text-[13px] lg:leading-4.5">{children}</span>
    </li>
  );
}

type Risk = "high" | "medium" | "ok";

// Tailwind needs full class names, so each risk level maps to literal strings.
const riskText: Record<Risk, string> = {
  high: "text-risk-high-solid",
  medium: "text-risk-medium-solid",
  ok: "text-risk-ok-solid",
};

const MATCHES: { rule: string; ruleTitle: string; section: string; badge: string; quote: string; risk: Risk }[] = [
  { rule: "Rule 4", ruleTitle: "Liability capped at 12 months' fees", section: "§ 8.2", badge: "High", quote: "Liability is unlimited for all direct and indirect losses.", risk: "high" },
  { rule: "Rule 7", ruleTitle: "Payment within 45 days", section: "§ 5.1", badge: "Medium", quote: "Invoices are payable within 60 days of receipt.", risk: "medium" },
  { rule: "Rule 11", ruleTitle: "Governed by English law", section: "§ 14.3", badge: "Matches", quote: "This agreement is governed by the laws of England and Wales.", risk: "ok" },
];

// Solid (not translucent) fills so the animated scene behind never shows through.
const labelClass =
  "w-fit rounded-md border border-[#454540] bg-[#252520] px-2.5 py-[5px] font-mono text-[11px] leading-3.5 tracking-[1.2px] text-text-inverse/70 uppercase";
const rowClass = "grid grid-cols-[1fr_104px_1fr]";

function PlaybookMatch() {
  return (
    <div className="pointer-events-none relative mx-auto hidden w-full max-w-152 flex-col gap-3.5 lg:my-8 lg:flex">
      <div aria-hidden className={rowClass}>
        <span className={labelClass}>Your playbook</span>
        <span />
        <span className={labelClass}>The contract</span>
      </div>
      <ul className="flex flex-col gap-7">
        {MATCHES.map((m) => (
          <li key={m.rule} className={rowClass}>
            <div className="flex min-h-24 flex-col justify-center gap-1.5 rounded-xl border border-[#454540] bg-[#252520] p-4">
              <span className={`font-mono text-[11px] leading-3.5 tracking-[1px] uppercase ${riskText[m.risk]}`}>{m.rule}</span>
              <span className="text-[15px] leading-5 font-medium text-text-inverse">{m.ruleTitle}</span>
            </div>
            <div aria-hidden className={`relative flex items-center ${riskText[m.risk]}`}>
              <span className="h-0.5 w-full bg-current" />
              <span className="absolute left-0 size-2.5 -translate-x-1/2 rounded-full border-2 border-bg-inverse bg-current" />
              <span className="absolute right-0 size-2.5 translate-x-1/2 rounded-full border-2 border-bg-inverse bg-current" />
            </div>
            <div className="flex min-h-24 flex-col justify-center gap-2 rounded-xl bg-[#faf7f0] px-4 py-3.5 text-text-primary">
              <div className="flex items-center gap-2">
                <span aria-hidden className={`size-1.5 rounded-full bg-current ${riskText[m.risk]}`} />
                <span className={`font-mono text-[10px] leading-3.5 tracking-[1px] uppercase ${riskText[m.risk]}`}>{m.badge}</span>
                <span className="font-mono text-[11px] leading-3.5 text-text-tertiary">{m.section}</span>
              </div>
              <p className="text-[13px] leading-4.5">{m.quote}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

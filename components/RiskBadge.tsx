import type { Risk } from "@/lib/review/view";

const STYLE: Record<Risk, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  medium: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  low: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  none: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

export const RISK_HIGHLIGHT: Record<Risk, { fill: string; border: string }> = {
  high: { fill: "rgba(239,68,68,0.22)", border: "#ef4444" },
  medium: { fill: "rgba(245,158,11,0.24)", border: "#f59e0b" },
  low: { fill: "rgba(14,165,233,0.2)", border: "#0ea5e9" },
  none: { fill: "transparent", border: "transparent" },
};

export function RiskBadge({ risk }: { risk: Risk }) {
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide ${STYLE[risk]}`}>
      {risk === "none" ? "ok" : risk}
    </span>
  );
}

import type { Risk } from "@/lib/review/view";

const STYLE: Record<Risk, { pill: string; text: string; dot: string; label: string }> = {
  high: { pill: "border-risk-high-border bg-risk-high-bg", text: "text-risk-high-fg", dot: "/ui/dot-high.svg", label: "High" },
  medium: { pill: "border-risk-medium-border bg-risk-medium-bg", text: "text-risk-medium-fg", dot: "/ui/dot-medium.svg", label: "Medium" },
  low: { pill: "border-risk-low-border bg-risk-low-bg", text: "text-risk-low-fg", dot: "/ui/dot-low.svg", label: "Low" },
  none: { pill: "border-border-default bg-bg-subtle", text: "text-text-secondary", dot: "/ui/dot-ok.svg", label: "OK" },
};

export const RISK_HIGHLIGHT: Record<Risk, { fill: string; border: string }> = {
  high: { fill: "rgba(229,72,77,0.2)", border: "#e5484d" },
  medium: { fill: "rgba(245,165,36,0.26)", border: "#f5a524" },
  low: { fill: "rgba(62,139,255,0.2)", border: "#3e8bff" },
  none: { fill: "transparent", border: "transparent" },
};

export function RiskBadge({ risk }: { risk: Risk }) {
  const s = STYLE[risk];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border py-[3px] pr-2.5 pl-2 ${s.pill}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={s.dot} alt="" width={6} height={6} />
      <span className={`font-mono text-[11px] leading-[14px] font-medium tracking-[0.8px] uppercase ${s.text}`}>{s.label}</span>
    </span>
  );
}

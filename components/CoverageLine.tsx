import type { FindingView } from "@/lib/review/view";

/** Distribution bar + legend: how the clauses split by risk, plus clauses the contract never contains. */
export function CoverageLine({ findings }: { findings: FindingView[] }) {
  const clauses = findings.filter((f) => f.clauseId);
  const n = (r: FindingView["riskLevel"]) => clauses.filter((f) => f.riskLevel === r).length;
  const segments = [
    { label: "high", count: n("high"), bar: "bg-risk-high-solid" },
    { label: "medium", count: n("medium"), bar: "bg-risk-medium-solid" },
    { label: "low", count: n("low"), bar: "bg-risk-low-solid" },
    { label: "ok", count: n("none"), bar: "bg-risk-ok-solid" },
  ];
  const missing = findings.length - clauses.length;
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex h-2 gap-[3px]" role="img" aria-label={segments.map((s) => `${s.count} ${s.label}`).join(", ")}>
        {segments.filter((s) => s.count > 0).map((s) => (
          <span key={s.label} className={`min-w-px rounded-full ${s.bar}`} style={{ flex: s.count }} />
        ))}
        {clauses.length === 0 && <span className="flex-1 rounded-full bg-bg-subtle" />}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs leading-4 text-text-secondary">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={`size-[7px] rounded-full ${s.bar}`} />
            {s.count} {s.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="size-[7px] rounded-full border border-text-tertiary" />
          {missing} missing
        </li>
      </ul>
    </div>
  );
}

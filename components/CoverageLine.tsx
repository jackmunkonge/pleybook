import { coverage, type FindingView } from "@/lib/review/view";

export function CoverageLine({ findings }: { findings: FindingView[] }) {
  const c = coverage(findings);
  const parts = [
    `${c.checked} clauses checked`,
    `${c.deviations} deviation${c.deviations === 1 ? "" : "s"}`,
    `${c.lowConfidence} low-confidence`,
    `${c.missing} missing`,
  ];
  return <p className="text-sm text-zinc-600 dark:text-zinc-400">{parts.join(" · ")}</p>;
}

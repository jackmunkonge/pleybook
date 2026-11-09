import type { FindingView } from "@/lib/review/view";

type Debug = {
  relevant?: boolean;
  margin?: number;
  topSimilarity?: number | null;
  reranked?: boolean;
  missingClause?: boolean;
  topRule?: { key: string; vectorRank: number | null; lexicalRank: number | null; rrfScore: number; rerankScore: number | null } | null;
};

const fmt = (n: number | null | undefined, d = 3) => (typeof n === "number" ? n.toFixed(d) : "–");

export function ReasoningPanel({ finding }: { finding: FindingView }) {
  const d = (finding.retrievalDebug ?? {}) as Debug;
  return (
    <div className="mt-2 space-y-2 rounded bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
      {finding.sourceSpan && (
        <p>
          <span className="font-medium">Quoted: </span>
          <q>{finding.sourceSpan}</q>{" "}
          <span className={finding.citationVerified ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
            {finding.citationVerified ? "✓ found in clause" : "✗ not found in clause: unverified"}
          </span>
        </p>
      )}
      {d.missingClause ? (
        <p>No clause in this document matched this playbook rule.</p>
      ) : (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono">
          <dt>rule</dt><dd>{finding.ruleKey ?? "none applied"}</dd>
          <dt>vector rank</dt><dd>{d.topRule?.vectorRank ?? "–"} (similarity {fmt(d.topSimilarity)})</dd>
          <dt>lexical rank</dt><dd>{d.topRule?.lexicalRank ?? "–"}</dd>
          <dt>RRF score</dt><dd>{fmt(d.topRule?.rrfScore, 4)}</dd>
          <dt>margin</dt><dd>{fmt(d.margin, 4)}</dd>
          <dt>reranked</dt><dd>{d.reranked ? `yes (score ${fmt(d.topRule?.rerankScore)})` : "no"}</dd>
          <dt>model</dt><dd>{finding.modelUsed ?? "none (no LLM call)"}</dd>
        </dl>
      )}
    </div>
  );
}

import type { ConfigResult, EvalRun, Metrics, MissReason } from "@/lib/eval/types";

const pct = (x: number | null, digits = 0) => (x === null ? "n/a" : `${(x * 100).toFixed(digits)}%`);

type MetricDef = {
  key: keyof Metrics;
  label: string;
  hint: string;
  /** Lower is better (false-positive rate). */
  invert?: boolean;
  detail: (c: ConfigResult) => string;
};

const METRICS: MetricDef[] = [
  {
    key: "recall",
    label: "Recall",
    hint: "Labelled deviations the reviewer flagged, in the right place.",
    detail: (c) => `${c.counts.goldHit} of ${c.counts.goldFindings}`,
  },
  {
    key: "ruleRecall",
    label: "Right rule",
    hint: "Recalled deviations that were also tied to the correct playbook rule.",
    detail: (c) => `${c.counts.goldRuleHit} of ${c.counts.goldFindings}`,
  },
  {
    key: "fpRate",
    label: "False-positive rate",
    hint: "Clauses with no labelled deviation that were flagged anyway. Lower is better.",
    invert: true,
    detail: (c) => `${c.counts.nonGoldFlagged} of ${c.counts.nonGoldUnits}`,
  },
  {
    key: "citationValidity",
    label: "Citation validity",
    hint: "Flagged findings whose quoted span really appears in the clause.",
    detail: (c) => `${c.counts.citationValid} of ${c.counts.citationChecked}`,
  },
  {
    key: "faithfulness",
    label: "Faithfulness",
    hint: "LLM-judged on a sample: is the stated reason supported by the clause text?",
    detail: (c) => (c.judge.sampled ? `${c.judge.faithful} of ${c.judge.sampled} sampled` : "not judged"),
  },
  {
    key: "missingRecall",
    label: "Missing clauses found",
    hint: "Playbook topics the contract never addresses, found by the reverse coverage check. The naive baseline has no such check.",
    detail: (c) => (c.metrics.missingRecall === null ? "no check" : `${c.counts.missingHit} of ${c.counts.missingGold}`),
  },
];

function Bar({ value, tone }: { value: number | null; tone: "naive" | "full" }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
      <div
        className={`h-full rounded-full ${tone === "full" ? "bg-sky-600 dark:bg-sky-400" : "bg-zinc-400 dark:bg-zinc-500"}`}
        style={{ width: `${Math.round((value ?? 0) * 100)}%` }}
      />
    </div>
  );
}

function MetricCard({ def, run }: { def: MetricDef; run: EvalRun }) {
  return (
    <section className="space-y-3 rounded border border-zinc-200 p-4 dark:border-zinc-800">
      <header>
        <h3 className="text-sm font-medium">{def.label}</h3>
        <p className="text-xs text-zinc-500">{def.hint}</p>
      </header>
      {(["naive", "full"] as const).map((name) => {
        const c = run.configs[name];
        const v = c.metrics[def.key];
        return (
          <div key={name} className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">{name === "naive" ? "Naive baseline" : "Full pipeline"}</span>
              <span className="tabular-nums">
                <strong className="font-semibold">{pct(v)}</strong>
                <span className="ml-2 text-xs text-zinc-500">{def.detail(c)}</span>
              </span>
            </div>
            <Bar value={v} tone={name} />
          </div>
        );
      })}
    </section>
  );
}

const REASON_LABEL: Record<MissReason, string> = {
  "no-unit": "Clause split or lost before review",
  filtered: "Dropped by the relevance pre-filter",
  "wrong-rule": "Retrieved the wrong rule",
  "model-said-none": "Model saw the right rule but said no risk",
  "model-wrong-rule": "Flagged, but attached to the wrong rule",
};

function MissTable({ run }: { run: EvalRun }) {
  const reasons = Object.keys(REASON_LABEL) as MissReason[];
  const count = (c: ConfigResult, r: MissReason) => c.misses.filter((m) => m.reason === r).length;
  const rows = reasons.filter((r) => count(run.configs.naive, r) + count(run.configs.full, r) > 0);
  if (rows.length === 0) return <p className="text-sm text-zinc-500">No misses recorded.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs text-zinc-500">
        <tr>
          <th className="py-1 font-medium">Where it went wrong</th>
          <th className="py-1 text-right font-medium">Naive</th>
          <th className="py-1 text-right font-medium">Full</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
        {rows.map((r) => (
          <tr key={r}>
            <td className="py-1.5">{REASON_LABEL[r]}</td>
            <td className="py-1.5 text-right tabular-nums">{count(run.configs.naive, r)}</td>
            <td className="py-1.5 text-right tabular-nums">{count(run.configs.full, r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ContractTable({ run }: { run: EvalRun }) {
  const naive = new Map(run.configs.naive.perContract.map((p) => [p.id, p]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-sm">
        <thead className="text-left text-xs text-zinc-500">
          <tr>
            <th className="py-1 font-medium">Contract</th>
            <th className="py-1 text-right font-medium">Labelled</th>
            <th className="py-1 text-right font-medium">Naive found</th>
            <th className="py-1 text-right font-medium">Full found</th>
            <th className="py-1 text-right font-medium">Naive FPs</th>
            <th className="py-1 text-right font-medium">Full FPs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
          {run.configs.full.perContract.map((f) => {
            const n = naive.get(f.id);
            return (
              <tr key={f.id}>
                <td className="py-1.5">
                  <span className="font-mono text-xs">{f.id}</span>
                  <span className="ml-2 text-xs text-zinc-500">{f.kind}</span>
                </td>
                <td className="py-1.5 text-right tabular-nums">{f.counts.goldFindings}</td>
                <td className="py-1.5 text-right tabular-nums">{n?.counts.goldHit ?? "–"}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{f.counts.goldHit}</td>
                <td className="py-1.5 text-right tabular-nums">{n?.counts.nonGoldFlagged ?? "–"}</td>
                <td className="py-1.5 text-right tabular-nums">{f.counts.nonGoldFlagged}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function History({ runs }: { runs: EvalRun[] }) {
  if (runs.length < 2) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Run history</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className="text-left text-xs text-zinc-500">
            <tr>
              <th className="py-1 font-medium">Run</th>
              <th className="py-1 font-medium">Note</th>
              <th className="py-1 text-right font-medium">Full recall</th>
              <th className="py-1 text-right font-medium">Full FP rate</th>
              <th className="py-1 text-right font-medium">Naive recall</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {runs.map((r, i) => (
              <tr key={r.createdAt} className={i === 0 ? "font-medium" : ""}>
                <td className="py-1.5 tabular-nums">{new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="py-1.5 text-zinc-600 dark:text-zinc-400">{r.note ?? ""}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(r.configs.full.metrics.recall)}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(r.configs.full.metrics.fpRate)}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(r.configs.naive.metrics.recall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function EvalDashboard({ runs }: { runs: EvalRun[] }) {
  const run = runs[0];
  if (!run) {
    return (
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        No evaluation has been run yet. Run <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">npm run eval</code> to produce one.
      </p>
    );
  }
  const models = [...new Set([...run.configs.naive.models, ...run.configs.full.models])];
  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">How well does it work?</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          A hand-labelled set of {run.gold.contracts} synthetic contracts with {run.gold.findings} known deviations from the playbook, reviewed two ways:
          a naive baseline, and the full pipeline. Same models, same playbook, same answer key.
        </p>
        <p className="text-xs text-zinc-500">
          Run {new Date(run.createdAt).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" })}
          {run.note ? ` · ${run.note}` : ""} · models: {models.join(", ") || "n/a"}
        </p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {METRICS.map((m) => (
          <MetricCard key={m.key} def={m} run={run} />
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Where each approach goes wrong</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Every labelled deviation that was not found, by the first stage that lost it.</p>
        <MissTable run={run} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">By contract</h2>
        <ContractTable run={run} />
      </section>

      <History runs={runs} />

      <section className="space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
        <h2 className="text-lg font-semibold text-foreground">How it is measured</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Naive baseline:</strong> {run.configs.naive.description}
          </li>
          <li>
            <strong>Full pipeline:</strong> {run.configs.full.description}
          </li>
          <li>A deviation counts as found when a flagged clause (or chunk) contains the labelled quote. False positives are flagged clauses that contain no labelled quote.</li>
          <li>
            Faithfulness is graded by a separate model on a spread sample of {run.configs.full.judge.sampled || "n/a"} findings per configuration, so treat it as indicative, not exact.
          </li>
          <li>The contracts are synthetic and the answer key was written by the project author, so these numbers show relative behaviour on this set, not real-world accuracy.</li>
        </ul>
      </section>
    </div>
  );
}

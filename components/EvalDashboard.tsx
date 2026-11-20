import type { ConfigResult, EvalRun, Metrics, MissReason } from "@/lib/eval/types";

const pct = (x: number | null, digits = 0) => (x === null ? "n/a" : `${(x * 100).toFixed(digits)}%`);

type MetricDef = {
  key: keyof Metrics;
  label: string;
  hint: string;
  /** Not shown on the mobile layout (the Figma mobile frame has a shorter list). */
  mobileHidden?: boolean;
  /** Lower is better (false-positive rate). */
  invert?: boolean;
  detail: (c: ConfigResult) => string;
};

const METRICS: MetricDef[] = [
  {
    key: "recall",
    mobileHidden: true,
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
    mobileHidden: true,
    label: "Faithfulness",
    hint: "LLM-judged on a sample: is the stated reason supported by the clause text?",
    detail: (c) => (c.judge.sampled ? `${c.judge.faithful} of ${c.judge.sampled} sampled` : "not judged"),
  },
  {
    key: "missingRecall",
    mobileHidden: true,
    label: "Missing clauses found",
    hint: "Playbook topics the contract never addresses, found by the reverse coverage check. The naive baseline has no such check.",
    detail: (c) => (c.metrics.missingRecall === null ? "no check" : `${c.counts.missingHit} of ${c.counts.missingGold}`),
  },
];

/* eslint-disable @next/next/no-img-element */
const ILLUSTRATION = [
  { src: "scale-support", box: "inset-[15.71%_49.72%_14.64%_26.94%]" },
  { src: "balance-beam", box: "inset-[15.71%_40.56%_73.21%_16.94%]" },
  { src: "left-suspension", box: "inset-[26.79%_71.11%_26.79%_6.67%]" },
  { src: "right-suspension", box: "inset-[18.93%_31.39%_33.21%_49.17%]" },
  { src: "pistachio-bar", box: "inset-[46.43%_78.33%_26.79%_13.61%]" },
  { src: "grey-bar", box: "inset-[57.86%_37.22%_33.21%_55%]" },
  { src: "left-pan", box: "inset-[73.21%_70.83%_20.71%_6.39%]" },
  { src: "right-pan", box: "inset-[66.79%_31.11%_27.5%_48.89%]" },
  { src: "clipboard", box: "inset-[47.05%_8.33%_14.64%_72.22%]" },
];

const DISPLAY = "display-axes font-display font-light";
const eyebrow = "font-mono text-[11px] leading-[14px] font-medium tracking-[0.8px] uppercase";

function Bar({ value, tone, size = "md" }: { value: number | null; tone: "naive" | "full"; size?: "md" | "lg" }) {
  return (
    <div className={`${size === "lg" ? "h-2.5" : "h-2"} w-full overflow-hidden rounded-full bg-bg-subtle`}>
      <div
        className={`h-full rounded-full ${tone === "full" ? "bg-brand-solid" : "bg-border-strong"}`}
        style={{ width: `${Math.round((value ?? 0) * 100)}%` }}
      />
    </div>
  );
}

function MetricCard({ def, run }: { def: MetricDef; run: EvalRun }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-border-default bg-bg-surface p-[18px] shadow-card lg:gap-3.5 lg:rounded-[18px] lg:p-6">
      <header className="flex flex-col gap-0.5 lg:gap-1">
        <h3 className="text-[15px] leading-[22px] font-medium tracking-[-0.1px]">{def.label}</h3>
        <p className="text-xs leading-4 text-text-secondary">{def.hint}</p>
      </header>
      {(["naive", "full"] as const).map((name) => {
        const c = run.configs[name];
        const v = c.metrics[def.key];
        return (
          <div key={name} className="flex flex-col gap-1.5">
            <div className="flex items-end gap-2">
              <span className="flex-1 text-xs leading-4 text-text-secondary">{name === "naive" ? "Naive baseline" : "Full pipeline"}</span>
              <strong className={`text-sm leading-[22px] font-medium tabular-nums ${name === "full" ? "text-brand-text" : ""}`}>{pct(v)}</strong>
              <span className="text-xs leading-4 text-text-tertiary">{def.detail(c)}</span>
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
  if (rows.length === 0) return <p className="text-sm text-text-tertiary">No misses recorded.</p>;
  return (
    <div className="overflow-hidden rounded-2xl border border-border-default bg-bg-surface">
      <div className={`${eyebrow} flex gap-4 bg-bg-subtle px-4 py-3 text-text-tertiary lg:px-6`}>
        <span className="flex-1">Where it went wrong</span>
        <span className="w-20 text-right">Naive</span>
        <span className="w-20 text-right">Full</span>
      </div>
      {rows.map((r) => (
        <div key={r} className="flex items-center gap-4 border-t border-border-default px-4 py-4 text-sm leading-[22px] first:border-t-0 lg:px-6">
          <span className="flex-1">{REASON_LABEL[r]}</span>
          <span className="w-20 text-right font-medium tabular-nums">{count(run.configs.naive, r)}</span>
          <span className="w-20 text-right font-medium text-brand-text tabular-nums">{count(run.configs.full, r)}</span>
        </div>
      ))}
    </div>
  );
}

function ContractTable({ run }: { run: EvalRun }) {
  const naive = new Map(run.configs.naive.perContract.map((p) => [p.id, p]));
  return (
    <div className="overflow-x-auto rounded-2xl border border-border-default bg-bg-surface">
      <table className="w-full min-w-[34rem] text-sm">
        <thead className={`${eyebrow} bg-bg-subtle text-left text-text-tertiary`}>
          <tr>
            <th className="px-4 py-3 font-medium lg:px-6">Contract</th>
            <th className="py-3 text-right font-medium">Labelled</th>
            <th className="py-3 text-right font-medium">Naive found</th>
            <th className="py-3 text-right font-medium">Full found</th>
            <th className="py-3 text-right font-medium">Naive FPs</th>
            <th className="px-4 py-3 text-right font-medium lg:px-6">Full FPs</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border-default">
          {run.configs.full.perContract.map((f) => {
            const n = naive.get(f.id);
            return (
              <tr key={f.id}>
                <td className="px-4 py-3 lg:px-6">
                  <span className="font-mono text-xs">{f.id}</span>
                  <span className="ml-2 text-xs text-text-tertiary">{f.kind}</span>
                </td>
                <td className="py-3 text-right tabular-nums">{f.counts.goldFindings}</td>
                <td className="py-3 text-right tabular-nums">{n?.counts.goldHit ?? "–"}</td>
                <td className="py-3 text-right font-medium text-brand-text tabular-nums">{f.counts.goldHit}</td>
                <td className="py-3 text-right tabular-nums">{n?.counts.nonGoldFlagged ?? "–"}</td>
                <td className="px-4 py-3 text-right tabular-nums lg:px-6">{f.counts.nonGoldFlagged}</td>
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
    <section className="flex flex-col gap-4">
      <h2 className="text-xl leading-[26px] font-semibold tracking-[-0.3px]">Run history</h2>
      <div className="overflow-x-auto rounded-2xl border border-border-default bg-bg-surface">
        <table className="w-full min-w-[34rem] text-sm">
          <thead className={`${eyebrow} bg-bg-subtle text-left text-text-tertiary`}>
            <tr>
              <th className="px-4 py-3 font-medium lg:px-6">Run</th>
              <th className="py-3 font-medium">Note</th>
              <th className="py-3 text-right font-medium">Full recall</th>
              <th className="py-3 text-right font-medium">Full FP rate</th>
              <th className="px-4 py-3 text-right font-medium lg:px-6">Naive recall</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default">
            {runs.map((r, i) => (
              <tr key={r.createdAt} className={i === 0 ? "font-medium" : ""}>
                <td className="px-4 py-3 tabular-nums lg:px-6">{new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                <td className="py-3 text-text-secondary">{r.note ?? ""}</td>
                <td className="py-3 text-right tabular-nums">{pct(r.configs.full.metrics.recall)}</td>
                <td className="py-3 text-right tabular-nums">{pct(r.configs.full.metrics.fpRate)}</td>
                <td className="px-4 py-3 text-right tabular-nums lg:px-6">{pct(r.configs.naive.metrics.recall)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Headline({ run }: { run: EvalRun }) {
  const { naive, full } = run.configs;
  const recall = full.metrics.recall;
  const stats = [
    { value: pct(full.metrics.citationValidity), label: "Quotes found in the clause" },
    { value: pct(full.metrics.fpRate), label: `False-positive rate (naive ${pct(naive.metrics.fpRate)})` },
    { value: pct(full.metrics.missingRecall), label: "Missing clauses found" },
  ];
  return (
    <section className="relative flex flex-col gap-3 overflow-hidden rounded-[20px] border border-border-default bg-bg-surface p-6 text-text-primary shadow-floating lg:flex-row lg:items-center lg:gap-14 lg:rounded-3xl lg:p-10">
      <img aria-hidden src="/eval/glow.svg" alt="" className="pointer-events-none absolute top-[-120px] right-[-110px] size-[380px] max-w-none lg:top-[-300px] lg:right-[-60px] lg:size-[660px]" />
      <div className="relative flex min-w-0 flex-1 flex-col gap-1.5 lg:gap-1.5">
        <p className={`${eyebrow} text-text-tertiary`}>
          Deviations caught
        </p>
        <div className="flex flex-col lg:flex-row lg:items-end lg:gap-5">
          <p className="text-[72px] leading-[74px] font-semibold tracking-[-2.5px] lg:text-[88px] lg:leading-[92px] lg:tracking-[-3px]">{pct(recall)}</p>
          <div className="flex flex-col pt-3 text-text-tertiary lg:pt-0 lg:pb-3">
            <p className="text-[13px] leading-5 lg:text-sm lg:leading-[22px] lg:font-medium">
              vs {pct(naive.metrics.recall)} <span className="hidden lg:inline">naive baseline</span>
              <span className="lg:hidden">for the naive baseline · {full.counts.goldHit} of {full.counts.goldFindings} found</span>
            </p>
            <p className="hidden text-xs leading-4 lg:block">
              {full.counts.goldHit} of {full.counts.goldFindings} found · {naive.counts.goldHit} of {naive.counts.goldFindings} for naive
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2.5 lg:mt-1.5">
          {(
            [
              ["Naive", naive.metrics.recall, "bg-border-strong"],
              ["Pleybook", recall, "bg-brand-solid shadow-[0_0_12px_rgba(160,207,110,0.7)]"],
            ] as const
          ).map(([label, v, fill]) => (
            <div key={label} className="flex items-center gap-2.5 lg:gap-3">
              <span className="w-[58px] text-xs leading-4 text-text-tertiary lg:w-[60px]">{label}</span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-border-default lg:max-w-[520px]">
                <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.round((v ?? 0) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
      <span aria-hidden className="relative hidden h-[120px] w-px bg-border-default lg:block" />
      <dl className="relative hidden w-[260px] flex-col gap-5 lg:flex">
        {stats.map((st) => (
          <div key={st.label} className="flex items-center gap-3.5">
            <dt className="order-2 flex-1 text-xs leading-4 text-text-tertiary">{st.label}</dt>
            <dd className="w-[90px] text-[28px] leading-8 font-semibold tracking-[-0.6px]">{st.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function EvalDashboard({ runs }: { runs: EvalRun[] }) {
  const run = runs[0];
  if (!run) {
    return (
      <p className="text-sm text-text-secondary">
        No evaluation has been run yet. Run <code className="rounded bg-bg-subtle px-1">npm run eval</code> to produce one.
      </p>
    );
  }
  const models = [...new Set([...run.configs.naive.models, ...run.configs.full.models])];
  const date = new Date(run.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <div className="flex flex-col gap-5 lg:gap-10">
      <header className="relative flex flex-col gap-5 lg:gap-4">
        <p className={`${eyebrow} text-brand-text`}>
          Evaluation · <span className="lg:hidden">{date}</span>
          <span className="hidden lg:inline">run of {date}{models.length ? ` · ${models.join(", ")}` : ""}</span>
        </p>
        <h1 className={`${DISPLAY} text-[36px] leading-[40px] tracking-[-1.2px] lg:text-[60px] lg:leading-[66px] lg:tracking-[-2px]`}>
          How well does it <em className="text-brand-text">actually work?</em>
        </h1>
        <p className="text-sm leading-[22px] text-text-secondary lg:max-w-[720px]">
          We wrote {run.gold.contracts} contracts and hand-labelled the {run.gold.findings} places they break the playbook. Then we reviewed
          each one twice, with a plain baseline and with the full pipeline, and scored both against the labels.
        </p>
        <div aria-hidden className="absolute -top-[30px] right-5 hidden h-[252px] w-[324px] lg:block">
          {ILLUSTRATION.map((l) => (
            <div key={l.src} className={`absolute ${l.box}`}>
              <img src={`/eval/${l.src}.svg`} alt="" className="block size-full max-w-none" />
            </div>
          ))}
        </div>
      </header>

      <Headline run={run} />

      <div className="grid gap-3 lg:grid-cols-3 lg:gap-5">
        {METRICS.map((m) => (
          <div key={m.key} className={m.mobileHidden ? "hidden lg:block" : undefined}>
            <MetricCard def={m} run={run} />
          </div>
        ))}
      </div>

      <section className="flex flex-col gap-3 lg:gap-4">
        <h2 className="text-xl leading-[26px] font-semibold tracking-[-0.3px]">Where each approach goes wrong</h2>
        <p className="text-[13px] leading-5 text-text-secondary">Every labelled deviation that was not found, by the first stage that lost it.</p>
        <MissTable run={run} />
      </section>

      <section className="flex flex-col gap-3 lg:gap-4">
        <h2 className="text-xl leading-[26px] font-semibold tracking-[-0.3px]">By contract</h2>
        <ContractTable run={run} />
      </section>

      <History runs={runs} />

      <section className="flex flex-col gap-3 text-sm text-text-secondary">
        <h2 className="text-xl leading-[26px] font-semibold tracking-[-0.3px] text-text-primary">How it is measured</h2>
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
        </ul>
      </section>

      <aside className="flex flex-col gap-1 rounded-[14px] border border-risk-medium-border bg-risk-medium-bg p-4 text-risk-medium-fg lg:rounded-2xl lg:p-5">
        <p className="text-[15px] leading-[22px] font-medium tracking-[-0.1px]">Read these numbers with care</p>
        <p className="text-xs leading-4 lg:text-[13px] lg:leading-5">
          The contracts are synthetic and the answer key was written by the project author, so these show relative behaviour on this set, not real-world accuracy.
          The LLM judge was the same model that produced the findings, and only {run.configs.full.judge.sampled || "a sample of"} findings per configuration were judged.
        </p>
      </aside>
    </div>
  );
}

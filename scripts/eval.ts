// Usage: tsx scripts/eval.ts [--only naive|full] [--contracts id,id] [--judge-sample N] [--note "text"] [--write]
// Runs the gold set through the naive baseline and the full pipeline, scores both, and writes
// eval/results/<timestamp>.json (only for a complete run, or with --write). Needs a seeded playbook.
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";
import path from "node:path";
import type { ConfigResult, ContractScore, EvalRun, JudgeSample } from "../lib/eval/types";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const pct = (x: number | null) => (x === null ? "  n/a" : `${(x * 100).toFixed(1).padStart(5)}%`);

async function main() {
  const { getDb } = await import("../lib/db/client");
  const { playbookRules } = await import("../lib/db/schema");
  const { loadGold } = await import("../lib/eval/gold");
  const { computeMetrics, scoreContract, sumCounts } = await import("../lib/eval/metrics");
  const { judgeFaithfulness, runFull, runNaive } = await import("../lib/eval/run");

  const only = arg("only") as "naive" | "full" | undefined;
  const wanted = arg("contracts")?.split(",");
  const judgeN = Number(arg("judge-sample") ?? 12);
  const gold = loadGold().filter((g) => !wanted || wanted.includes(g.id));
  if (gold.length === 0) throw new Error("no gold contracts selected");

  const ruleRows = await getDb().select().from(playbookRules);
  if (ruleRows.length === 0) throw new Error("playbook is empty: run `npm run playbook:seed` first");
  const allRuleKeys = ruleRows.map((r) => r.ruleKey);
  const ruleLabel = new Map(ruleRows.map((r) => [r.ruleKey, `${r.ruleName}: ${r.ruleText} Preferred: ${r.preferredPosition ?? "n/a"}`]));

  const configs: ConfigResult[] = [];
  for (const name of ["naive", "full"] as const) {
    if (only && only !== name) continue;
    const t0 = Date.now();
    const perContract: ContractScore[] = [];
    const models = new Set<string>();
    const judgeInputs: Parameters<typeof judgeFaithfulness>[0] = [];
    console.log(`\n== ${name} ==`);
    for (const g of gold) {
      const res = name === "naive" ? await runNaive(g) : await runFull(g, allRuleKeys);
      res.models.forEach((m) => models.add(m));
      const score = scoreContract(g, res.units, res.predictedMissing);
      perContract.push(score);
      res.units.forEach((u, i) => {
        if (u.flagged && u.reason) {
          judgeInputs.push({
            id: `${g.id}#${u.ref ?? i}`, contract: g.id, clause: u.text, rule: u.ruleKey ? (ruleLabel.get(u.ruleKey) ?? u.ruleKey) : null,
            risk: u.riskLevel, reason: u.reason, span: u.span,
          });
        }
      });
      const c = score.counts;
      console.log(`  ${g.id.padEnd(28)} recall ${c.goldHit}/${c.goldFindings}  flagged ${c.flagged}/${c.units}  fp ${c.nonGoldFlagged}/${c.nonGoldUnits}`);
    }
    const counts = sumCounts(perContract.map((p) => p.counts));
    let judge = { sampled: 0, faithful: 0, samples: [] as JudgeSample[], model: null as string | null };
    if (!process.argv.includes("--no-judge")) {
      console.log(`  judging faithfulness (${Math.min(judgeN, judgeInputs.length)} of ${judgeInputs.length} flagged)…`);
      judge = await judgeFaithfulness(judgeInputs, judgeN);
    }
    const metrics = computeMetrics(counts, name === "full", judge.sampled ? judge.faithful / judge.sampled : null);
    configs.push({
      name,
      description:
        name === "naive"
          ? `Fixed ${(await import("../lib/eval/run")).NAIVE_CHUNK_CHARS}-character chunks, vector-only top-1 rule, every chunk sent to the model, no citation validation, no missing-clause check.`
          : "Clause segmentation, hybrid retrieval (vector + lexical, RRF) with selective rerank, relevance pre-filter, citation validation, and missing-clause detection.",
      metrics, counts, perContract, misses: perContract.flatMap((p) => p.misses), judge,
      models: [...models], durationSec: Math.round((Date.now() - t0) / 1000),
    });
    console.log(`  recall ${pct(metrics.recall)} (rule ${pct(metrics.ruleRecall)})  precision ${pct(metrics.precision)}  FP ${pct(metrics.fpRate)}  citations ${pct(metrics.citationValidity)}  faithful ${pct(metrics.faithfulness)}  missing P/R ${pct(metrics.missingPrecision)}/${pct(metrics.missingRecall)}`);
  }

  const reasons = new Map<string, number>();
  for (const c of configs) for (const m of c.misses) reasons.set(`${c.name}:${m.reason}`, (reasons.get(`${c.name}:${m.reason}`) ?? 0) + 1);
  console.log("\nmisses by reason:", Object.fromEntries(reasons));

  if (configs.length === 2 && (!wanted || process.argv.includes("--write"))) {
    const run: EvalRun = {
      version: 1,
      createdAt: new Date().toISOString(),
      note: arg("note"),
      gold: { contracts: gold.length, findings: gold.reduce((n, g) => n + g.findings.length, 0), missing: gold.reduce((n, g) => n + g.missing.length, 0) },
      configs: {
        naive: configs.find((c) => c.name === "naive")!,
        full: configs.find((c) => c.name === "full")!,
      },
    };
    const dir = path.join(process.cwd(), "eval/results");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${run.createdAt.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(file, JSON.stringify(run, null, 2));
    console.log(`\nwrote ${path.relative(process.cwd(), file)}`);
  } else {
    console.log("\n(partial run: nothing written; pass --write to force)");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

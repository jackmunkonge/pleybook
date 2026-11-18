import fs from "node:fs";
import path from "node:path";
import type { EvalRun } from "./types";

const DIR = path.join(process.cwd(), "eval/results");

/** All stored eval runs, newest first. Files are named by timestamp, so a name sort is a time sort. */
export function loadRuns(): EvalRun[] {
  if (!fs.existsSync(DIR)) return [];
  return fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse()
    .flatMap((f) => {
      try {
        const run = JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")) as EvalRun;
        return run.version === 1 ? [run] : [];
      } catch {
        return [];
      }
    });
}

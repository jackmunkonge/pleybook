import fs from "node:fs";
import path from "node:path";
import type { GoldContract } from "./types";

const DIR = path.join(process.cwd(), "data/gold");

export type LoadedGold = GoldContract & { text: string };

export function loadGold(): LoadedGold[] {
  const { contracts } = JSON.parse(fs.readFileSync(path.join(DIR, "labels.json"), "utf8")) as { contracts: GoldContract[] };
  return contracts.map((c) => ({ ...c, text: fs.readFileSync(path.join(DIR, c.file), "utf8") }));
}

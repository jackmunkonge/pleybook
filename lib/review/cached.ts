import fs from "node:fs";
import path from "node:path";

/** A saved review of the bundled sample MSA, used when live providers are unavailable. */
export type DemoClause = { clauseRef: string | null; textHash: string; embedding: number[] };
export type DemoFinding = {
  /** null for "missing clause" findings, which belong to no clause. */
  textHash: string | null;
  ruleKey: string | null;
  riskLevel: "none" | "low" | "medium" | "high";
  deviationReason: string | null;
  sourceSpan: string | null;
  confidence: "low" | "medium" | "high";
  citationVerified: boolean;
  retrievalDebug: unknown;
  modelUsed: string | null;
};
export type DemoSnapshot = {
  version: 1;
  createdAt: string;
  filename: string;
  embedModel: string;
  embedDim: number;
  clauses: DemoClause[];
  findings: DemoFinding[];
};

const FILE = path.join(process.cwd(), "data/demo/sample-msa-review.json");

/** The snapshot, or null when none has been generated yet (run `npm run demo:precompute`). */
export function loadDemoSnapshot(): DemoSnapshot | null {
  try {
    const s = JSON.parse(fs.readFileSync(FILE, "utf8")) as DemoSnapshot;
    return s.version === 1 ? s : null;
  } catch {
    return null;
  }
}

export type StoredClause = { id: string; textHash: string };
export type PlannedFinding = DemoFinding & { clauseId: string | null };

/**
 * Pair snapshot findings with the clauses stored for a document, by text hash. Returns null unless
 * every snapshot clause is present, so a stale snapshot (the sample PDF changed) is never half-applied.
 */
export function planCachedFindings(snapshot: DemoSnapshot, stored: StoredClause[]): PlannedFinding[] | null {
  const byHash = new Map(stored.map((c) => [c.textHash, c.id]));
  if (snapshot.clauses.some((c) => !byHash.has(c.textHash))) return null;
  const planned: PlannedFinding[] = [];
  for (const f of snapshot.findings) {
    if (f.textHash === null) {
      planned.push({ ...f, clauseId: null });
      continue;
    }
    const clauseId = byHash.get(f.textHash);
    if (!clauseId) return null;
    planned.push({ ...f, clauseId });
  }
  return planned;
}

/** Embeddings from the snapshot keyed by clause hash, only when they match the configured embedding model. */
export function snapshotVectors(snapshot: DemoSnapshot | null, model: string, dim: number): Map<string, number[]> {
  const out = new Map<string, number[]>();
  if (!snapshot || snapshot.embedModel !== model || snapshot.embedDim !== dim) return out;
  for (const c of snapshot.clauses) if (c.embedding.length === dim) out.set(c.textHash, c.embedding);
  return out;
}

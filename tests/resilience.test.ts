import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { describeIngestError, describeReviewError } from "@/lib/errors";
import { ingestBuffer } from "@/lib/ingest";
import { loadDemoSnapshot, planCachedFindings, snapshotVectors, type DemoSnapshot } from "@/lib/review/cached";
import { capClauses } from "@/lib/review/job";

describe("describeReviewError", () => {
  it("never leads with the raw provider chain", () => {
    const f = describeReviewError("All LLM providers failed: gemini(503), groq(403), openrouter(The operation was aborted due to timeout)");
    expect(f.kind).toBe("providers");
    expect(f.message).not.toMatch(/gemini|groq|403/i);
    expect(f.detail).toContain("gemini(503)"); // kept for the technical-details disclosure
  });
  it("recognises rate limits and falls back to a generic message", () => {
    expect(describeReviewError("429 Too Many Requests").kind).toBe("rate-limit");
    expect(describeReviewError("kaboom").kind).toBe("unknown");
    expect(describeReviewError(null).message).toBeTruthy();
  });
});

describe("describeIngestError", () => {
  it("explains common upload problems in plain language", () => {
    expect(describeIngestError(Object.assign(new Error("No password given"), { name: "PasswordException" })).message).toMatch(/password-protected/);
    expect(describeIngestError(new Error("Invalid PDF structure.")).message).toMatch(/valid PDF/);
    expect(describeIngestError(new Error("Embedding request failed (429): quota")).status).toBe(503);
    expect(describeIngestError(new Error("Can't find end of central directory")).message).toMatch(/DOCX/);
  });
  it("never echoes an unknown internal error", () => {
    const f = describeIngestError(new Error("TypeError: cannot read properties of undefined (reading 'x')"));
    expect(f.message).not.toMatch(/TypeError/);
    expect(f.status).toBe(422);
  });
});

const snap = (over: Partial<DemoSnapshot> = {}): DemoSnapshot => ({
  version: 1, createdAt: "2026-01-01T00:00:00Z", filename: "sample-msa.pdf", embedModel: "m", embedDim: 2,
  clauses: [{ clauseRef: "1.1", textHash: "h1", embedding: [0.1, 0.2] }, { clauseRef: "1.2", textHash: "h2", embedding: [0.3, 0.4] }],
  findings: [
    { textHash: "h1", ruleKey: "payment-terms", riskLevel: "high", deviationReason: "x", sourceSpan: "y", confidence: "high", citationVerified: true, retrievalDebug: {}, modelUsed: "m" },
    { textHash: null, ruleKey: "service-levels", riskLevel: "medium", deviationReason: "missing", sourceSpan: null, confidence: "medium", citationVerified: true, retrievalDebug: {}, modelUsed: null },
  ],
  ...over,
});

describe("planCachedFindings", () => {
  it("attaches findings to stored clauses by hash, leaving missing-clause findings unattached", () => {
    const plan = planCachedFindings(snap(), [{ id: "A", textHash: "h1" }, { id: "B", textHash: "h2" }]);
    expect(plan?.map((f) => f.clauseId)).toEqual(["A", null]);
  });
  it("refuses a stale snapshot instead of half-applying it", () => {
    expect(planCachedFindings(snap(), [{ id: "A", textHash: "h1" }])).toBeNull(); // h2 no longer exists
    expect(planCachedFindings(snap(), [{ id: "A", textHash: "other" }, { id: "B", textHash: "h2" }])).toBeNull();
  });
});

describe("snapshotVectors", () => {
  it("returns saved embeddings only when model and dimension match", () => {
    expect(snapshotVectors(snap(), "m", 2).get("h1")).toEqual([0.1, 0.2]);
    expect(snapshotVectors(snap(), "other-model", 2).size).toBe(0);
    expect(snapshotVectors(snap(), "m", 768).size).toBe(0);
    expect(snapshotVectors(null, "m", 2).size).toBe(0);
  });
});

describe("capClauses", () => {
  it("limits a long contract and leaves a short one alone", () => {
    expect(capClauses(120, 50)).toBe(50);
    expect(capClauses(27, 50)).toBe(27);
  });
});

describe("saved demo review", () => {
  const snapshot = loadDemoSnapshot();
  it.skipIf(!snapshot)("matches the bundled sample contract exactly, so it is never stale", async () => {
    const bytes = fs.readFileSync(path.join(__dirname, "../data/contracts/sample-msa.pdf"));
    const ingested = await ingestBuffer(new Uint8Array(bytes), "sample-msa.pdf");
    expect(snapshot!.clauses.map((c) => c.textHash)).toEqual(ingested.clauses.map((c) => c.textHash));
  });
  it.skipIf(!snapshot)("has a finding for every clause and verified citations on everything it flags", () => {
    const hashes = new Set(snapshot!.findings.map((f) => f.textHash));
    for (const c of snapshot!.clauses) expect(hashes.has(c.textHash)).toBe(true);
    for (const f of snapshot!.findings) if (f.riskLevel !== "none") expect(f.sourceSpan || f.textHash === null).toBeTruthy();
  });
});

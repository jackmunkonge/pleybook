import { getEnv } from "@/lib/env";

export type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export const DEFAULT_EMBED_MODEL = "gemini-embedding-001";
const BATCH_SIZE = 50;
const MIN_INTERVAL_MS = 1200; // stay well under the free-tier RPM
const MAX_RETRIES = 5;

let lastCall = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  const wait = lastCall + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCall = Date.now();
}

/** Scale to unit length (Gemini only returns normalized vectors at the full 3072 dims). */
export function normalize(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return norm === 0 ? v : v.map((x) => x / norm);
}

type BatchResponse = { embeddings?: { values: number[] }[]; error?: { message: string } };

async function embedBatch(texts: string[], task: EmbedTask): Promise<number[][]> {
  const env = getEnv();
  const key = env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set (needed for embeddings)");
  const model = env.EMBED_MODEL || DEFAULT_EMBED_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`;
  const body = JSON.stringify({
    requests: texts.map((text) => ({
      model: `models/${model}`,
      content: { parts: [{ text }] },
      taskType: task,
      outputDimensionality: env.EMBED_DIM,
    })),
  });

  for (let attempt = 0; ; attempt++) {
    await throttle();
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body,
    });
    if (res.ok) {
      const json = (await res.json()) as BatchResponse;
      if (json.embeddings?.length !== texts.length) throw new Error("Embedding response size mismatch");
      return json.embeddings.map((e) => normalize(e.values));
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= MAX_RETRIES) {
      throw new Error(`Embedding request failed (${res.status}): ${(await res.text()).slice(0, 300)}`);
    }
    await sleep(Math.min(30_000, 2000 * 2 ** attempt));
  }
}

/** Embed many texts: batched and rate-limited. Output order matches input order. */
export async function embedTexts(texts: string[], task: EmbedTask = "RETRIEVAL_DOCUMENT"): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    out.push(...(await embedBatch(texts.slice(i, i + BATCH_SIZE), task)));
  }
  return out;
}

/**
 * Turn raw failures into messages a person can act on. The raw text is kept (as `detail`) for a
 * "technical details" disclosure, but is never the headline: "All LLM providers failed: gemini(429)..."
 * means nothing to someone who just uploaded a contract.
 */
export type Friendly = { message: string; detail?: string; kind: "providers" | "rate-limit" | "network" | "unknown" };

/** Review-time failures (the model providers), from a stored `reviews.error` or an API error body. */
export function describeReviewError(raw: string | null | undefined): Friendly {
  const detail = raw?.trim() || undefined;
  const text = detail ?? "";
  if (/all llm providers failed|no llm provider configured/i.test(text)) {
    return {
      kind: "providers",
      message: "The AI providers are busy or unavailable right now. Nothing is lost: retry in a minute and the review picks up where it left off.",
      detail,
    };
  }
  if (/429|rate.?limit|quota|too many requests/i.test(text)) {
    return { kind: "rate-limit", message: "The AI service is rate-limiting requests. Wait a moment and retry; progress so far is kept.", detail };
  }
  if (/embedding/i.test(text)) {
    return { kind: "providers", message: "The embedding service is unavailable right now. Retry in a minute.", detail };
  }
  return { kind: "unknown", message: "Something went wrong while reviewing. Retry, and if it keeps happening, try again later.", detail };
}

/** Upload-time failures: map to an HTTP status and a plain explanation. */
export function describeIngestError(e: unknown): { status: number; message: string } {
  const name = (e as { name?: string } | null)?.name ?? "";
  const msg = e instanceof Error ? e.message : String(e);
  if (name === "PasswordException" || /password/i.test(msg)) {
    return { status: 422, message: "This PDF is password-protected. Remove the password and upload it again." };
  }
  if (/embedding request failed|GOOGLE_GENERATIVE_AI_API_KEY/i.test(msg)) {
    return { status: 503, message: "The embedding service is unavailable right now, so the contract could not be indexed. Try again in a minute. The sample MSA still works." };
  }
  if (name === "InvalidPDFException" || /invalid pdf|unexpected end|bad xref|missing pdf header/i.test(msg)) {
    return { status: 422, message: "This file doesn't look like a valid PDF. Re-export it and try again." };
  }
  if (/zip|central directory|docx|end of data|corrupted/i.test(msg)) {
    return { status: 422, message: "This file doesn't look like a valid DOCX. Re-save it from Word and try again." };
  }
  return { status: 422, message: "We couldn't read this file. Check that it is a text-based PDF or a DOCX and try again." };
}

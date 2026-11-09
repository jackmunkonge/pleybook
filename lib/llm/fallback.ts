export type ProviderSlot<M> = { name: string; modelId: string; model: M; take?: () => Promise<void> };

export type ProviderAttempt = { provider: string; model: string; ok: boolean; error?: string; status?: number };

export class AllProvidersFailedError extends Error {
  constructor(public attempts: ProviderAttempt[]) {
    super(`All LLM providers failed: ${attempts.map((a) => `${a.provider}(${a.status ?? a.error})`).join(", ")}`);
  }
}

function statusOf(e: unknown): number | undefined {
  const s = (e as { statusCode?: number; status?: number })?.statusCode ?? (e as { status?: number })?.status;
  return typeof s === "number" ? s : undefined;
}

/**
 * Try each provider in order. Any failure (429 quota, 5xx, bad key, malformed/incomplete output
 * rejected by `run`) moves on to the next. Returns the first success plus the attempt log.
 */
export async function withFallback<M, T>(
  slots: ProviderSlot<M>[],
  run: (model: M, slot: ProviderSlot<M>) => Promise<T>,
): Promise<{ value: T; used: ProviderSlot<M>; attempts: ProviderAttempt[] }> {
  const attempts: ProviderAttempt[] = [];
  for (const slot of slots) {
    try {
      await slot.take?.();
      const value = await run(slot.model, slot);
      attempts.push({ provider: slot.name, model: slot.modelId, ok: true });
      return { value, used: slot, attempts };
    } catch (e) {
      attempts.push({
        provider: slot.name,
        model: slot.modelId,
        ok: false,
        status: statusOf(e),
        error: (e instanceof Error ? e.message : String(e)).slice(0, 200),
      });
    }
  }
  throw new AllProvidersFailedError(attempts);
}

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { getEnv } from "@/lib/env";
import type { ProviderSlot } from "./fallback";
import { limiterFor } from "./limiter";

// Model IDs come from env (they change often); these are only defaults when unset.
const DEFAULT_PRIMARY = "gemini-3.8-flash";
const DEFAULT_FALLBACK = "openai/gpt-oss-120b";
const DEFAULT_OPENROUTER = "openrouter/free";

/** Provider chain in priority order: Gemini -> Groq -> OpenRouter. Only providers with a key are included. */
export function getProviderChain(): ProviderSlot<LanguageModel>[] {
  const env = getEnv();
  const chain: ProviderSlot<LanguageModel>[] = [];
  if (env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const id = env.PRIMARY_MODEL || DEFAULT_PRIMARY;
    chain.push({
      name: "gemini",
      modelId: id,
      model: createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(id),
      take: () => limiterFor("gemini", 5).take(),
    });
  }
  if (env.GROQ_API_KEY) {
    const id = env.FALLBACK_MODEL || DEFAULT_FALLBACK;
    chain.push({
      name: "groq",
      modelId: id,
      model: createGroq({ apiKey: env.GROQ_API_KEY })(id),
      take: () => limiterFor("groq", 20).take(),
    });
  }
  if (env.OPENROUTER_API_KEY) {
    const id = env.OPENROUTER_MODEL || DEFAULT_OPENROUTER;
    chain.push({
      name: "openrouter",
      modelId: id,
      model: createOpenAICompatible({
        name: "openrouter",
        supportsStructuredOutputs: true,
        baseURL: "https://openrouter.ai/api/v1",
        apiKey: env.OPENROUTER_API_KEY,
      })(id),
      take: () => limiterFor("openrouter", 10).take(),
      // The free router is slow; as the last resort it gets longer. Worst case 45+45+100s stays under the 300s route limit.
      timeoutMs: 100_000,
    });
  }
  return chain;
}

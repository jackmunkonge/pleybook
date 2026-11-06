import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  COHERE_API_KEY: z.string().optional(),
  PRIMARY_MODEL: z.string().optional(),
  FALLBACK_MODEL: z.string().optional(),
  EMBED_MODEL: z.string().optional(),
  EMBED_DIM: z.coerce.number().int().positive().default(768),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated env, parsed lazily so importing this module never throws at build time. */
export function getEnv(): Env {
  if (!cached) {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      const issues = result.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      throw new Error(`Invalid environment: ${issues}`);
    }
    cached = result.data;
  }
  return cached;
}

export function parseEnv(source: Record<string, string | undefined>): Env {
  return schema.parse(source);
}

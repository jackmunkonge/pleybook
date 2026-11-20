import { z } from "zod";

export const MAX_RULES = 40;
export const MAX_VARIANTS = 10;

/** One playbook rule as the editor sees it. */
export type PlaybookRule = {
  key: string;
  name: string;
  category: string;
  text: string;
  preferred: string;
  fallback: string;
  variants: string[];
};

export type RuleStatus = "default" | "edited" | "added";
export type PlaybookRuleView = PlaybookRule & { status: RuleStatus };

const line = (max: number) => z.string().trim().max(max);

export const ruleInput = z.object({
  name: line(120).min(1, "name is required"),
  category: line(40).default(""),
  text: line(2000).min(1, "rule text is required"),
  preferred: line(1000).default(""),
  fallback: line(1000).default(""),
  variants: z.array(line(1000).min(1)).max(MAX_VARIANTS).default([]),
});
export type RuleInput = z.infer<typeof ruleInput>;

/** URL-safe key from a rule name; `taken` keys get a numeric suffix. */
export function slugifyKey(name: string, taken: Iterable<string>): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "rule";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}-${n}`)) return `${base}-${n}`;
}

const same = (a: PlaybookRule, b: PlaybookRule) =>
  a.name === b.name &&
  a.category === b.category &&
  a.text === b.text &&
  a.preferred === b.preferred &&
  a.fallback === b.fallback &&
  a.variants.length === b.variants.length &&
  a.variants.every((v, i) => v === b.variants[i]);

/** Mark each of a user's rules as unchanged, edited or added relative to the shipped defaults. */
export function withStatus(rules: PlaybookRule[], defaults: PlaybookRule[]): PlaybookRuleView[] {
  const byKey = new Map(defaults.map((d) => [d.key, d]));
  return rules.map((r) => {
    const d = byKey.get(r.key);
    return { ...r, status: !d ? "added" : same(r, d) ? "default" : "edited" };
  });
}

/** Rules whose text or name changed need a fresh embedding; the embedded string matches the seed script. */
export const ruleEmbedText = (r: { name: string; text: string }) => `${r.name}. ${r.text}`;

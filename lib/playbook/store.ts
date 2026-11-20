import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { playbookRules, reviews, ruleVariants } from "@/lib/db/schema";
import { embedTexts } from "@/lib/embed";
import { ReviewError } from "@/lib/review/job";
import { playbookOwner, ruleScope } from "./owner";
import { MAX_RULES, ruleEmbedText, slugifyKey, withStatus, type PlaybookRule, type PlaybookRuleView, type RuleInput } from "./rules";

type RuleRow = typeof playbookRules.$inferSelect;


async function load(owner: string | null): Promise<PlaybookRule[]> {
  const db = getDb();
  const rows = await db.select().from(playbookRules).where(ruleScope(owner)).orderBy(asc(playbookRules.position), asc(playbookRules.ruleKey));
  if (!rows.length) return [];
  const variants = await db.select().from(ruleVariants).where(inArray(ruleVariants.ruleId, rows.map((r) => r.id)));
  const byRule = new Map<string, string[]>();
  for (const v of variants) byRule.set(v.ruleId, [...(byRule.get(v.ruleId) ?? []), v.text]);
  return rows.map((r) => toRule(r, byRule.get(r.id) ?? []));
}

const toRule = (r: RuleRow, variants: string[]): PlaybookRule => ({
  key: r.ruleKey,
  name: r.ruleName,
  category: r.category ?? "",
  text: r.ruleText,
  preferred: r.preferredPosition ?? "",
  fallback: r.fallbackPosition ?? "",
  variants,
});

export async function listPlaybook(userId: string): Promise<{ custom: boolean; rules: PlaybookRuleView[] }> {
  const [defaults, own] = await Promise.all([load(null), load(userId)]);
  if (!own.length) return { custom: false, rules: withStatus(defaults, defaults) };
  return { custom: true, rules: withStatus(own, defaults) };
}

/** A playbook can't change under a review that is still running: its findings would point at two rule sets. */
async function assertNoActiveReview(userId: string) {
  const [row] = await getDb()
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.userId, userId), inArray(reviews.status, ["pending", "running"])))
    .limit(1);
  if (row) throw new ReviewError(409, "A review is still running. Wait for it to finish before editing the playbook.");
}

/** Copy the shared defaults (embeddings included) into the user's own rows, in one statement. */
async function ensureOwnCopy(userId: string) {
  if ((await playbookOwner(userId)) === userId) return;
  await getDb().execute(sql`
    WITH ins AS (
      INSERT INTO playbook_rules (user_id, rule_key, rule_name, rule_text, preferred_position, fallback_position, category, position, embedding)
      SELECT ${userId}, rule_key, rule_name, rule_text, preferred_position, fallback_position, category, position, embedding
      FROM playbook_rules WHERE user_id IS NULL
      ON CONFLICT DO NOTHING
      RETURNING id, rule_key
    )
    INSERT INTO rule_variants (rule_id, text, embedding)
    SELECT ins.id, v.text, v.embedding
    FROM ins
    JOIN playbook_rules d ON d.user_id IS NULL AND d.rule_key = ins.rule_key
    JOIN rule_variants v ON v.rule_id = d.id`);
}

async function embedFor(rule: Pick<RuleInput, "name" | "text">, variants: string[]) {
  // Embed before writing anything, so a failed embedding call can't leave a half-saved rule.
  const vecs = await embedTexts([ruleEmbedText(rule), ...variants], "RETRIEVAL_DOCUMENT");
  return { rule: vecs[0], variants: vecs.slice(1) };
}

async function replaceVariants(ruleId: string, variants: string[], vecs: number[][]) {
  const db = getDb();
  await db.delete(ruleVariants).where(eq(ruleVariants.ruleId, ruleId));
  if (variants.length) await db.insert(ruleVariants).values(variants.map((text, i) => ({ ruleId, text, embedding: vecs[i] })));
}

async function positions(userId: string) {
  return (await getDb().select({ p: playbookRules.position }).from(playbookRules).where(eq(playbookRules.userId, userId))).map((r) => r.p);
}

const values = (input: RuleInput) => ({
  ruleName: input.name,
  ruleText: input.text,
  category: input.category || null,
  preferredPosition: input.preferred || null,
  fallbackPosition: input.fallback || null,
});

export async function createRule(userId: string, input: RuleInput): Promise<string> {
  await assertNoActiveReview(userId);
  await ensureOwnCopy(userId);
  const existing = await load(userId);
  if (existing.length >= MAX_RULES) throw new ReviewError(409, `A playbook can have at most ${MAX_RULES} rules.`);
  const key = slugifyKey(input.name, existing.map((r) => r.key));
  const emb = await embedFor(input, input.variants);
  const [row] = await getDb().insert(playbookRules).values({ userId, ruleKey: key, ...values(input), position: existing.length ? Math.max(...(await positions(userId))) + 1 : 0, embedding: emb.rule }).returning({ id: playbookRules.id });
  await replaceVariants(row.id, input.variants, emb.variants);
  return key;
}

export async function updateRule(userId: string, key: string, input: RuleInput) {
  await assertNoActiveReview(userId);
  await ensureOwnCopy(userId);
  const db = getDb();
  const [row] = await db.select().from(playbookRules).where(and(eq(playbookRules.userId, userId), eq(playbookRules.ruleKey, key)));
  if (!row) throw new ReviewError(404, "rule not found");
  const emb = await embedFor(input, input.variants);
  await db.update(playbookRules).set({ ...values(input), embedding: emb.rule }).where(eq(playbookRules.id, row.id));
  await replaceVariants(row.id, input.variants, emb.variants);
}

export async function deleteRule(userId: string, key: string) {
  await assertNoActiveReview(userId);
  await ensureOwnCopy(userId);
  const deleted = await getDb()
    .delete(playbookRules)
    .where(and(eq(playbookRules.userId, userId), eq(playbookRules.ruleKey, key)))
    .returning({ id: playbookRules.id });
  if (!deleted.length) throw new ReviewError(404, "rule not found");
}

/** Drop the user's own rules; their reviews go back to the shared defaults. */
export async function resetPlaybook(userId: string) {
  await assertNoActiveReview(userId);
  await getDb().delete(playbookRules).where(eq(playbookRules.userId, userId));
}

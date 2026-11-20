// Usage: tsx scripts/seed-playbook.ts
// Upserts data/playbook.json into playbook_rules / rule_variants and embeds anything missing an embedding.
import { config } from "dotenv";
config({ path: ".env.local" });
import fs from "node:fs";

type Rule = { key: string; name: string; category: string; text: string; preferred: string; fallback: string; variants: string[] };

async function main() {
  const rules: Rule[] = JSON.parse(fs.readFileSync("data/playbook.json", "utf8"));
  const { getDb } = await import("../lib/db/client");
  const { playbookRules, ruleVariants } = await import("../lib/db/schema");
  const { embedTexts } = await import("../lib/embed");
  const { and, eq, isNull } = await import("drizzle-orm");
  const db = getDb();

  for (const [position, r] of rules.entries()) {
    const values = {
      ruleKey: r.key,
      ruleName: r.name,
      ruleText: r.text,
      preferredPosition: r.preferred,
      fallbackPosition: r.fallback,
      category: r.category,
      position,
    };
    // Only the shared defaults (user_id null); users' own copies are never touched by the seed.
    const [existing] = await db.select().from(playbookRules).where(and(eq(playbookRules.ruleKey, r.key), isNull(playbookRules.userId)));
    // Changing the text invalidates the stored embedding, so null it out to re-embed below.
    const changed = existing && (existing.ruleText !== r.text || existing.ruleName !== r.name);
    const [row] = await db
      .insert(playbookRules)
      .values(values)
      .onConflictDoUpdate({ target: playbookRules.ruleKey, targetWhere: isNull(playbookRules.userId), set: { ...values, ...(changed ? { embedding: null } : {}) } })
      .returning({ id: playbookRules.id });
    const have = await db.select().from(ruleVariants).where(eq(ruleVariants.ruleId, row.id));
    const keep = new Set(r.variants);
    for (const v of have) if (!keep.has(v.text)) await db.delete(ruleVariants).where(eq(ruleVariants.id, v.id));
    const haveTexts = new Set(have.map((v) => v.text));
    const fresh = r.variants.filter((t) => !haveTexts.has(t));
    if (fresh.length) await db.insert(ruleVariants).values(fresh.map((text) => ({ ruleId: row.id, text })));
  }

  const ruleRows = await db.select().from(playbookRules).where(and(isNull(playbookRules.userId), isNull(playbookRules.embedding)));
  if (ruleRows.length) {
    const vecs = await embedTexts(ruleRows.map((r) => `${r.ruleName}. ${r.ruleText}`), "RETRIEVAL_DOCUMENT");
    for (let i = 0; i < ruleRows.length; i++) {
      await db.update(playbookRules).set({ embedding: vecs[i] }).where(eq(playbookRules.id, ruleRows[i].id));
    }
  }
  const varRows = await db.select().from(ruleVariants).where(isNull(ruleVariants.embedding));
  if (varRows.length) {
    const vecs = await embedTexts(varRows.map((v) => v.text), "RETRIEVAL_DOCUMENT");
    for (let i = 0; i < varRows.length; i++) {
      await db.update(ruleVariants).set({ embedding: vecs[i] }).where(eq(ruleVariants.id, varRows[i].id));
    }
  }
  console.log(`seeded ${rules.length} rules; embedded ${ruleRows.length} rules + ${varRows.length} variants`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

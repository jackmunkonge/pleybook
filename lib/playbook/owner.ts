import { eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { playbookRules } from "@/lib/db/schema";

/** Whose rules a user's reviews run against: their own copy once they have one, otherwise the shared defaults (null). */
export async function playbookOwner(userId: string): Promise<string | null> {
  const [row] = await getDb().select({ id: playbookRules.id }).from(playbookRules).where(eq(playbookRules.userId, userId)).limit(1);
  return row ? userId : null;
}

/** SQL filter for one owner's rules; null selects the shared defaults. */
export const ruleScope = (owner: string | null) => (owner ? eq(playbookRules.userId, owner) : isNull(playbookRules.userId));

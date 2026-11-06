import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const username = process.argv[2]?.toLowerCase();
  if (!username) {
    console.error("usage: npm run user:delete -- <username>");
    process.exit(1);
  }
  const { eq } = await import("drizzle-orm");
  const { getDb } = await import("../lib/db/client");
  const { user } = await import("../lib/db/schema");
  // sessions/accounts/documents/reviews cascade-delete with the user.
  const deleted = await getDb().delete(user).where(eq(user.username, username)).returning({ id: user.id });
  console.log(deleted.length ? `deleted "${username}"` : `no such user "${username}"`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

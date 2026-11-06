import { config } from "dotenv";
config({ path: ".env.local" });

async function main() {
  const { getDb } = await import("../lib/db/client");
  const { user } = await import("../lib/db/schema");
  const rows = await getDb().select({ username: user.username, createdAt: user.createdAt }).from(user);
  if (rows.length === 0) console.log("(no users)");
  for (const r of rows) console.log(`${r.username}\t${r.createdAt.toISOString()}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

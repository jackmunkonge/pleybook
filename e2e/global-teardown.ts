import { config } from "dotenv";
import fs from "node:fs";
import { STUB_MODE_FILE } from "../playwright.config";
import { E2E_USER } from "./creds";

config({ path: ".env.local" });

export default async function globalTeardown() {
  const { eq } = await import("drizzle-orm");
  const { getDb } = await import("../lib/db/client");
  const { user } = await import("../lib/db/schema");
  await getDb().delete(user).where(eq(user.username, E2E_USER));
  fs.rmSync(STUB_MODE_FILE, { force: true });
}

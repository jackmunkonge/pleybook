import { config } from "dotenv";
import fs from "node:fs";
import { STUB_MODE_FILE } from "../playwright.config";
import { E2E_PASSWORD, E2E_USER } from "./creds";

config({ path: ".env.local" });

/** Creates a throwaway user on the dev database; global-teardown deletes it (reviews and documents cascade). */
export default async function globalSetup() {
  fs.writeFileSync(STUB_MODE_FILE, "ok");
  const { createAuth } = await import("../lib/auth");
  const { eq } = await import("drizzle-orm");
  const { getDb } = await import("../lib/db/client");
  const { user } = await import("../lib/db/schema");
  await getDb().delete(user).where(eq(user.username, E2E_USER)); // leftovers from a crashed run
  await createAuth({ allowSignUp: true }).api.signUpEmail({
    body: { email: `${E2E_USER}@pleybook.invalid`, password: E2E_PASSWORD, name: E2E_USER, username: E2E_USER },
  });
}

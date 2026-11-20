import fs from "node:fs";
import type { Page } from "@playwright/test";
import { STUB_MODE_FILE } from "../playwright.config";
import { E2E_PASSWORD, E2E_USER } from "./creds";

export async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(E2E_USER);
  await page.getByLabel("Password").fill(E2E_PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL("/");
}

/** Flip the stubbed model providers between answering and returning 503s. */
export const setProviders = (mode: "ok" | "down") => fs.writeFileSync(STUB_MODE_FILE, mode);

/** Deletes the test user's documents (reviews and findings cascade) so each test starts from nothing. */
export async function resetUserData() {
  const { config } = await import("dotenv");
  config({ path: ".env.local" });
  const { eq } = await import("drizzle-orm");
  const { getDb } = await import("../lib/db/client");
  const { documents, user } = await import("../lib/db/schema");
  const [u] = await getDb().select({ id: user.id }).from(user).where(eq(user.username, E2E_USER));
  if (u) await getDb().delete(documents).where(eq(documents.userId, u.id));
}

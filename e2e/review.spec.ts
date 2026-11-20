import { expect, test } from "@playwright/test";
import { login, resetUserData, setProviders } from "./helpers";

test.beforeEach(async ({ page }) => {
  setProviders("ok");
  await resetUserData(); // the sample route reopens an existing review, so start each test clean
  await login(page);
});

test("upload rejection messages", async ({ page }) => {
  const input = page.locator('input[type="file"]');

  // The input's accept filter is advisory; the server still validates.
  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  await expect(page.getByRole("alert").filter({ hasText: "only .pdf and .docx" })).toBeVisible();

  await input.setInputFiles({ name: "broken.pdf", mimeType: "application/pdf", buffer: Buffer.from("this is not a pdf") });
  await expect(page.getByRole("alert").filter({ hasText: /./ }).first()).toBeVisible();
  await expect(page).toHaveURL("/"); // no review was started
});

test("sample review completes (stubbed models) and clicking a finding highlights it", async ({ page }) => {
  await page.locator("#try-sample").click();
  await page.waitForURL(/\/review\//);

  // Findings fill in as batches complete; the review is done when the "vs. single prompt" tab becomes usable.
  const rows = page.locator("[data-row]");
  await expect(rows.first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("stub-model").first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByRole("status").filter({ hasText: /reviewing|clauses/i })).toHaveCount(0, { timeout: 90_000 });

  const flagged = rows.filter({ hasText: "Quote verified" }).first();
  await flagged.getByRole("button").first().click();
  const id = await flagged.getAttribute("data-row");
  // Selecting a row marks the matching region in the document pane (PDF overlay or text fallback).
  await expect(page.locator(`[data-finding="${id}"]`).first()).toBeVisible();
  await expect(page.locator(`[data-finding="${id}"]`).first()).toHaveCSS("border-top-width", "2px");
});

test("cached fallback: sample review is served from the saved copy when every provider is down", async ({ page }) => {
  setProviders("down");
  await page.locator("#try-sample").click();
  await page.waitForURL(/\/review\//);
  // The client retries a few times with backoff, then swaps in the saved review.
  await expect(page.getByText(/cached/i).first()).toBeVisible({ timeout: 110_000 });
  await expect(page.locator("[data-row]").first()).toBeVisible();
});

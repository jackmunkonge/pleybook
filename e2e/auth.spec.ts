import { expect, test } from "@playwright/test";
import { E2E_USER } from "./creds";
import { login } from "./helpers";

test.describe("unauthenticated", () => {
  test("pages redirect to /login", async ({ page }) => {
    for (const path of ["/", "/playbook", "/eval", "/review/5f0d6f0e-8c3e-4e49-9a53-0d1f6f1c2b11"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("API routes return 401, and /api/health stays public", async ({ request }) => {
    const id = "5f0d6f0e-8c3e-4e49-9a53-0d1f6f1c2b11";
    const calls = [
      request.post("/api/documents", { multipart: { file: { name: "a.pdf", mimeType: "application/pdf", buffer: Buffer.from("x") } } }),
      request.post("/api/documents/sample"),
      request.post("/api/reviews", { data: { documentId: id } }),
      request.get(`/api/reviews/${id}`),
      request.post(`/api/reviews/${id}`),
      request.post(`/api/reviews/${id}/cached`),
      request.get("/api/playbook"),
    ];
    for (const res of await Promise.all(calls)) expect(res.status()).toBe(401);
    expect((await request.get("/api/health")).status()).toBe(200);
  });

  test("public sign-up is rejected", async ({ request }) => {
    const res = await request.post("/api/auth/sign-up/email", {
      data: { email: "intruder@pleybook.invalid", password: "intruder-pass-1", name: "x", username: "intruder" },
    });
    expect(res.ok()).toBe(false);
  });
});

test("wrong password shows an error and stays on /login", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Username").fill(E2E_USER);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByText("Invalid username or password.")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("login then logout", async ({ page }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: /Review a contract/ })).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(page.getByText(`Signed in as ${E2E_USER}`)).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

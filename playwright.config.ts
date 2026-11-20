import { defineConfig } from "@playwright/test";
import path from "node:path";

const PORT = 3100;
export const STUB_MODE_FILE = path.join(__dirname, "e2e/.stub-mode");

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1, // one shared test user and one shared stub-mode file
  retries: 0,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      E2E_STUB_LLM: "1",
      E2E_STUB_MODE_FILE: STUB_MODE_FILE,
      COHERE_API_KEY: "", // no reranking calls
      DAILY_REVIEW_LIMIT: "50",
    },
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});

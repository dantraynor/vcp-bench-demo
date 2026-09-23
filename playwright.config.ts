import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "./tests/database";

process.env.DATABASE_URL = testDatabaseUrl(
  process.env.E2E_DATABASE_URL ??
    "postgresql://postgres@127.0.0.1:54329/bench_adoption_e2e_test",
);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45_000,
  globalSetup: "./tests/e2e/setup.ts",
  use: {
    baseURL: "http://localhost:3100",
    ...devices["Desktop Chrome"],
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    },
    screenshot: "only-on-failure",
    trace: "off",
  },
  webServer: {
    command: "npm run start -- --port 3100 --hostname 127.0.0.1",
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

import { defineConfig, devices } from "@playwright/test";
import { testDatabaseUrl } from "./tests/database";

const workers = process.env.E2E_RUNTIME === "workers";

process.env.DATABASE_URL = testDatabaseUrl(
  process.env.E2E_DATABASE_URL ??
    "postgresql://postgres@127.0.0.1:54329/bench_adoption_e2e_test",
);
const hyperdriveUrl = new URL(process.env.DATABASE_URL);
// Miniflare requires a password even though local PostgreSQL uses trust auth.
hyperdriveUrl.password ||= "unused";

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
    command: workers
      ? "npm run start:vinext -- --port 3100 --ip 127.0.0.1"
      : "npm run start -- --port 3100 --hostname 127.0.0.1",
    env: {
      CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE:
        hyperdriveUrl.toString(),
    },
    url: "http://localhost:3100",
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

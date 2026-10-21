import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Variables del stack local (scripts/local-stack/start.sh). Nunca apuntar a un proyecto real.
const RUN = process.env.PALACE_RUN_DIR ?? "/tmp/palace-local-run";
const env = Object.fromEntries(
  readFileSync(`${RUN}/env`, "utf8").trim().split("\n").map((l) => l.split(/=(.*)/s).slice(0, 2) as [string, string]),
);
if (!env.NEXT_PUBLIC_SUPABASE_URL?.startsWith("http://127.0.0.1")) throw new Error("E2E solo contra el stack local");

const PORT = 3100;
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: "retain-on-failure", locale: "es-MX", timezoneId: "America/Mexico_City" },
  projects: [
    { name: "escritorio", use: { ...devices["Desktop Chrome"] } },
    { name: "movil", use: { ...devices["Pixel 7"] }, testMatch: /movil\.spec\.ts/ },
  ],
  webServer: {
    command: `pnpm --filter @palace/web exec next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { ...env, NEXT_PUBLIC_APP_ENV: "e2e" },
  },
});

import { defineConfig, devices } from "@playwright/test"
import os from "node:os"

const E2E_PORT = process.env.E2E_PORT || "4101"
const E2E_BASE_URL = `http://localhost:${E2E_PORT}`
const CPU_COUNT = os.cpus().length
const SAFE_MAX_WORKERS = Math.max(1, Math.min(CPU_COUNT, 4))
const DEFAULT_WORKERS = process.env.CI ? Math.max(1, Math.floor(CPU_COUNT * 0.6)) : SAFE_MAX_WORKERS

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.PW_WORKERS ? Number(process.env.PW_WORKERS) : DEFAULT_WORKERS,
  timeout: process.env.CI ? 60_000 : 30_000,
  expect: { timeout: 10_000 },
  reporter: [["html", { open: "never" }], ["list"]],

  use: {
    baseURL: E2E_BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 5"],
        storageState: "e2e/.auth/user.json",
      },
      dependencies: ["setup"],
    },
  ],

  webServer: {
    // Run the SAME runtime as production (Dockerfile: `node server.js` from the
    // standalone output). `next start` is unsupported with output: "standalone"
    // - it warns on every run - and it would mean e2e never exercises the
    // standalone server, so a standalone-only breakage could ship unnoticed.
    command: `node scripts/prepare-standalone.mjs && AUTH_TRUST_HOST=true NEXTAUTH_URL=${E2E_BASE_URL} PORT=${E2E_PORT} HOSTNAME=127.0.0.1 node .next/standalone/server.js`,
    url: E2E_BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
})


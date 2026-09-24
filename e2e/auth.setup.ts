import { test as setup } from "@playwright/test";
import fs from "fs";
import path from "path";

const authFile = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  // Must match the accounts created by prisma/seed.ts (admin@erp.yarasoft.net /
  // demo1234). The previous defaults (admin@yaraerp.app / password123) matched no
  // seeded user, so the auth state was never created: CI threw here and the whole
  // e2e job failed before running a single spec, while locally an EMPTY auth state
  // was written and every protected-page test passed vacuously.
  const email = process.env.E2E_EMAIL || "admin@erp.yarasoft.net";
  const password = process.env.E2E_PASSWORD || "demo1234";

  await page.goto("/login");

  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#login-submit").click();

  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 15_000,
    });
    await page.context().storageState({ path: authFile });
    console.log("[E2E] Auth OK — storageState saved");
  } catch (err) {
    console.error("[E2E] Auth FAILED (wrong credentials or DB mismatch).", err);
    throw new Error(
      `Authentication setup failed for ${email}. Seed the database first ` +
        `(npx tsx prisma/seed.ts) or set E2E_EMAIL/E2E_PASSWORD. Details: ${err}`,
    );
  }
});

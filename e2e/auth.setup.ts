import { test as setup } from "@playwright/test";
import fs from "fs";
import path from "path";

const authFile = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  const authDir = path.dirname(authFile);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const email = process.env.E2E_EMAIL || "admin@yaraerp.app";
  const password = process.env.E2E_PASSWORD || "password123";

  await page.goto("/login");

  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.locator("#login-submit").click();

  try {
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 8_000,
    });
    await page.context().storageState({ path: authFile });
    console.log("[E2E] Auth OK — storageState saved");
  } catch (err) {
    console.error("[E2E] Auth FAILED (wrong credentials or DB mismatch).", err);
    if (!process.env.CI) {
      console.warn("[E2E] Saving empty state; protected-page tests will skip.");
      fs.writeFileSync(
        authFile,
        JSON.stringify({ cookies: [], origins: [] }, null, 2),
      );
    } else {
      throw new Error(
        `Authentication setup failed! E2E tests cannot proceed. Details: ${err}`,
      );
    }
  }
});

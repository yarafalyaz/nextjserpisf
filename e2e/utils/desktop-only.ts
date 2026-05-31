import { test } from "@playwright/test"

/**
 * Skip spec saat project Playwright mobile.
 */
export function skipOnMobile(projectName: string, reason = "Desktop-focused CRUD interaction") {
  if (projectName.includes("mobile")) {
    test.skip(true, reason)
  }
}

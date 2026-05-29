import { test, expect } from "@playwright/test"

test.describe("Authentication flow", () => {
  // Use empty state so we do not inherit the setup's cookies
  test.use({ storageState: { cookies: [], origins: [] } })

  test("should show login form", async ({ page }) => {
    await page.goto("/login")
    await expect(page.locator("#email")).toBeVisible()
    await expect(page.locator("#password")).toBeVisible()
    await expect(page.getByRole("button", { name: /masuk|login/i })).toBeVisible()
  })

  test("should block access to dashboard and redirect to login", async ({ page }) => {
    await page.goto("/")
    await page.waitForURL(/\/login/)
    await expect(page).toHaveURL(/\/login/)
  })
})

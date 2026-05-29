import { test, expect } from "@playwright/test"

test.describe("Dashboard & Pages after login", () => {
  const pages = ["/penjualan", "/penjualan/penawaran", "/penjualan/pesanan", "/inventaris", "/keuangan", "/master"]

  for (const path of pages) {
    test(`load ${path} stable`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState("networkidle")
      await expect(page.locator("body")).not.toContainText("Error")
    })
  }
})

import { test, expect } from "@playwright/test"

test.describe("Inventory module flows", () => {
  test("Stock adjustment list loads", async ({ page }) => {
    await page.goto("/inventaris/penyesuaian")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Penyesuaian")
  })

  test("Stock adjustment create form loads", async ({ page }) => {
    await page.goto("/inventaris/penyesuaian/tambah")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("form, [data-testid='form']")).toBeVisible({ timeout: 15000 })
  })

  test("Material issue list loads", async ({ page }) => {
    await page.goto("/inventaris/pengeluaran-material")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Material")
  })

  test("Stock transfer list loads", async ({ page }) => {
    await page.goto("/inventaris/transfer")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Transfer")
  })

  test("Stock mutation list loads", async ({ page }) => {
    await page.goto("/inventaris/mutasi-stok")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Mutasi")
  })
})

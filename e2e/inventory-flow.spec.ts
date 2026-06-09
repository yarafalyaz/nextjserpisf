import { test, expect } from "@playwright/test"

test.describe("Inventory module flows", () => {
  test("Stock adjustment list loads", async ({ page }) => {
    await page.goto("/inventaris/penyesuaian-stok")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Penyesuaian")
  })

  test("Stock adjustment create form loads", async ({ page }) => {
    await page.goto("/inventaris/penyesuaian-stok/tambah")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("form, [data-testid='form']")).toBeVisible({ timeout: 15000 })
  })

  test("Material issue list loads", async ({ page }) => {
    await page.goto("/inventaris/pengeluaran-material")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Material")
  })

  test("Stock transfer list loads", async ({ page }) => {
    await page.goto("/inventaris/transfer-stok")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Transfer")
  })

  test("Goods receipt list loads", async ({ page }) => {
    await page.goto("/inventaris/penerimaan-barang")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Penerimaan")
  })
})

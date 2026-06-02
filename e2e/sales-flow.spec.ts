import { test, expect } from "@playwright/test"

test.describe("Sales flow", () => {
  test("Quotation list loads", async ({ page }) => {
    await page.goto("/penjualan/penawaran")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Penawaran")
  })

  test("Quotation create form loads", async ({ page }) => {
    await page.goto("/penjualan/penawaran/tambah")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("form, [data-testid='form']")).toBeVisible({ timeout: 15000 })
  })

  test("Sales order list loads", async ({ page }) => {
    await page.goto("/penjualan/pesanan")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Pesanan")
  })

  test("Invoice list loads", async ({ page }) => {
    await page.goto("/penjualan/faktur")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Faktur")
  })
})

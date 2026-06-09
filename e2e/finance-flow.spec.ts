import { test, expect } from "@playwright/test"

test.describe("Finance module flows", () => {
  test("Expense list loads", async ({ page }) => {
    await page.goto("/keuangan/pengeluaran")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Pengeluaran")
  })

  test("Expense create form loads", async ({ page }) => {
    await page.goto("/keuangan/pengeluaran/tambah")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("form, [data-testid='form']")).toBeVisible({ timeout: 15000 })
  })

  test("Petty cash list loads", async ({ page }) => {
    await page.goto("/keuangan/kas-kecil")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Kas Kecil")
  })

  test("Journal list loads", async ({ page }) => {
    await page.goto("/keuangan/jurnal")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Jurnal")
  })

  test("Journal create form loads", async ({ page }) => {
    await page.goto("/keuangan/jurnal/tambah")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("form, [data-testid='form']")).toBeVisible({ timeout: 15000 })
  })

  test("Budget list loads", async ({ page }) => {
    await page.goto("/keuangan/anggaran")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Anggaran")
  })
})

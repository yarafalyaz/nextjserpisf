import { test, expect } from "@playwright/test"

test.describe("Payroll module flows", () => {
  test("Payroll list loads", async ({ page }) => {
    await page.goto("/sdm/penggajian")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Penggajian")
  })

  test("Payroll create form loads", async ({ page }) => {
    await page.goto("/sdm/penggajian/tambah")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("form, [data-testid='form']")).toBeVisible({ timeout: 15000 })
  })

  test("Employee loan list loads", async ({ page }) => {
    await page.goto("/sdm/pinjaman")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Pinjaman")
  })

  test("Attendance list loads", async ({ page }) => {
    await page.goto("/sdm/absensi")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Absensi")
  })

  test("Leave request list loads", async ({ page }) => {
    await page.goto("/sdm/cuti")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText("Cuti")
  })
})

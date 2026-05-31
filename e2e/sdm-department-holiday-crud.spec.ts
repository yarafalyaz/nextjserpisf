import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

const ts = Date.now()

test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})

test.describe("SDM Hari Libur Departemen CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    const name = `Dept Holiday E2E ${ts}`
    const updated = `Dept Holiday E2E Updated ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/sdm/hari-libur-departemen/tambah", { waitUntil: "domcontentloaded" })

    const departmentInput = page.locator("input[placeholder='Cari departemen...']").first()
    await departmentInput.click()
    await departmentInput.fill("Dep")
    // Wait for autocomplete dropdown to appear
    await expect(page.locator("[role='option'], [role='listbox'] li, .autocomplete-item").first()).toBeVisible({ timeout: 5000 })
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")

    await page.locator("#name").fill(name)
    await page.locator("input[name='date'][type='date']").fill("2026-12-24")
    await page.locator("#submit-department-holiday").click()

    await page.waitForURL("**/sdm/hari-libur-departemen", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ────────────────────────────────────────────────
    const row = page.locator("tr").filter({ hasText: name })
    await expect(row).toBeVisible()
    await row.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Edit" }).first().click()

    await page.waitForURL(/\/sdm\/hari-libur-departemen\/\d+\/ubah/, { timeout: 20000 })
    await page.waitForLoadState("networkidle")

    await page.locator("#name").fill(updated)
    await page.locator("input[name='date'][type='date']").fill("2026-12-25")
    await page.locator("#submit-department-holiday").click()

    await page.waitForURL("**/sdm/hari-libur-departemen", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ────────────────────────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible()
    await updatedRow.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    // Wait for delete confirmation to complete
    await expect(updatedRow).toHaveCount(0, { timeout: 10000 })
    await page.goto("/sdm/hari-libur-departemen", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(updated)
  })
})

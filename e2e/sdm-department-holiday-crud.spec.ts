import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"


test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(2000)
}


test.describe("SDM Hari Libur Departemen CRUD", () => {
  test("create → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Dept Holiday E2E ${ts}`
    const updated = `Dept Holiday E2E Updated ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/sdm/hari-libur-departemen/tambah", { waitUntil: "domcontentloaded" })

    await waitForHydration(page)
    const departmentInput = page.locator("input[placeholder='Cari departemen...']").first()
    await departmentInput.click()
    await departmentInput.fill("HRD")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")

    await page.locator("#name").fill(name)
    await waitForHydration(page)
    await page.locator("#submit-department-holiday").click()

    await page.waitForURL("**/sdm/hari-libur-departemen", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ────────────────────────────────────────────────
    const row = page.locator("tr").filter({ hasText: name }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/sdm\/hari-libur-departemen\/\d+\/ubah/, { timeout: 20000 })
    await page.waitForLoadState("networkidle")

    await page.locator("#name").fill(updated)
    await waitForHydration(page)
    await page.locator("#submit-department-holiday").click()

    await page.waitForURL("**/sdm/hari-libur-departemen", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ────────────────────────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated }).first()
    await expect(updatedRow).toBeVisible({ timeout: 15000 })
    await updatedRow.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()

    // Confirm delete — click Hapus in confirmation dialog
    await page.locator("button").filter({ hasText: "Hapus" }).last().click()

    // Wait for page to re-render after server action
    await page.waitForLoadState("networkidle")

    // Verify the row is gone
    await expect(page.locator("body")).not.toContainText(updated, { timeout: 15000 })
  })
})
import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

const ts = Date.now()

test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(5000)
}


test.describe("SDM Hari Libur Departemen CRUD", () => {
  test("create → update → delete", async ({ page }) => {
    const name = `Dept Holiday E2E ${ts}`
    const updated = `Dept Holiday E2E Updated ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/sdm/hari-libur-departemen/tambah", { waitUntil: "domcontentloaded" })

    const departmentInput = page.locator("input[placeholder='Cari departemen...']").first()
    await departmentInput.click()
    await departmentInput.fill("Dep")
    await page.keyboard.press("ArrowDown")
    await page.keyboard.press("Enter")

    await page.locator("#name").fill(name)
    await page.locator("input[name='date'][type='date']").fill("2026-12-24")
    await waitForHydration(page)
    await page.locator("#submit-department-holiday").click()

    await page.waitForURL("**/sdm/hari-libur-departemen", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ────────────────────────────────────────────────
    const row = page.locator("tr").filter({ hasText: name }).first()
    await expect(row).toBeVisible()
    await row.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Edit" }).first().click()

    await page.waitForURL(/\/sdm\/hari-libur-departemen\/\d+\/ubah/, { timeout: 20000 })
    await page.waitForLoadState("networkidle")

    await page.locator("#name").fill(updated)
    await page.locator("input[name='date'][type='date']").fill("2026-12-25")
    await waitForHydration(page)
    await page.locator("#submit-department-holiday").click()

    await page.waitForURL("**/sdm/hari-libur-departemen", { timeout: 20000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ────────────────────────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated }).first()
    await expect(updatedRow).toBeVisible()
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
import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

const ts = Date.now()

async function closeMobileSidebarIfOpen(page: Page) {
  const overlay = page.locator(".sidebar-overlay")
  if (!(await overlay.isVisible().catch(() => false))) return

  const closeBtn = page.locator(".sidebar-close-btn")
  if (await closeBtn.isVisible().catch(() => false)) {
    await closeBtn.click({ force: true })
  } else {
    await page.keyboard.press("Escape")
  }

  await expect(overlay).toBeHidden({ timeout: 5000 })
}


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(5000)
}


test.describe("Aset Brand (Merek) CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Brand Aset CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }) => {
    const name = `brand-e2e-${ts}`
    const updated = `brand-e2e-updated-${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/aset/merek/tambah", { waitUntil: "domcontentloaded" })
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Tambah Brand Aset" })).toBeVisible()

    await page.locator("#name").fill(name)
    await waitForHydration(page)
    await page.locator("button[type='submit']").click()
    await page.waitForURL("**/aset/merek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const createdRow = page.locator("tr").filter({ hasText: name }).first()
    await expect(createdRow).toBeVisible()
    await createdRow.locator("a").filter({ hasText: name }).click({ force: true })

    await page.waitForURL(/\/aset\/merek\/\d+$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto("/aset/merek", { waitUntil: "domcontentloaded" })
    await closeMobileSidebarIfOpen(page)

    const rowForEdit = page.locator("tr").filter({ hasText: name }).first()
    await expect(rowForEdit).toBeVisible()

    // Open ActionDropdown → Edit
    await rowForEdit.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Edit" }).first().click()

    await page.waitForURL(/\/aset\/merek\/\d+\/ubah$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)
    await page.locator("#name").fill(updated)
    await waitForHydration(page)
    await page.locator("button[type='submit']").click()
    await page.waitForURL("**/aset/merek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated }).first()
    await expect(updatedRow).toBeVisible()

    await updatedRow.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()

    // Confirm dialog
    const confirmBtn = page.locator("button").filter({ hasText: "Hapus" }).last()
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click({ force: true })

    await page.waitForLoadState("networkidle")
    await expect(updatedRow).toBeHidden({ timeout: 15000 })
    await expect(page.locator("body")).not.toContainText(updated, { timeout: 5000 })
  })
})

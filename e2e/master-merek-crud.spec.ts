import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"


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
  await page.waitForTimeout(2000)
}


test.describe("Master Merek CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Merek CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Brand E2E ${ts}`
    const updated = `Brand E2E Updated ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/master/merek/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Tambah Merek" })).toBeVisible({ timeout: 15000 })

    await page.locator("#name").fill(name)
    await waitForHydration(page)
    await page.locator("#submit-brand").click()
    await page.waitForURL("**/master/merek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const detailLink = page
      .locator("a[href^='/master/merek/']")
      .filter({ hasText: name })
      .first()
    await expect(detailLink).toBeVisible({ timeout: 15000 })
    const detailHref = await detailLink.getAttribute("href")
    if (!detailHref) throw new Error("Could not get detail href")
    await page.goto(detailHref, { waitUntil: "domcontentloaded" })

    await waitForHydration(page)
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto("/master/merek", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    const row = page.getByRole("row", { name: new RegExp(name) }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.getByRole("button", { name: "Menu" }).click()
    await page.getByRole("menuitem", { name: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/master\/merek\/\d+\/ubah$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)

    await page.locator("#name").fill(updated)
    await waitForHydration(page)
    await page.getByRole("button", { name: /Update|Perbarui/ }).click()

    await page.waitForURL("**/master/merek", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    const updatedRow = page.getByRole("row", { name: new RegExp(updated) }).first()
    await expect(updatedRow).toBeVisible({ timeout: 15000 })

    await updatedRow.getByRole("button", { name: "Menu" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).first().click()

    // Confirm dialog
    await page.getByRole("button", { name: "Hapus" }).last().click()
    await page.waitForLoadState("networkidle")

    // Verify gone
    await expect(page.getByRole("row", { name: new RegExp(updated) })).toHaveCount(0, { timeout: 15000 })
  })
})

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

  await expect(overlay).toBeHidden()
}

test.describe("Master Kelompok Pajak CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Kelompok Pajak CRUD khusus desktop")
  })

  test("create → delete", async ({ page }) => {
    const name = `Grup E2E ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/master/kelompok-pajak/tambah", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Tambah Grup Pajak" })).toBeVisible()

    await page.locator("#name").fill(name)
    await page.getByRole("button", { name: "Simpan" }).click()

    await page.waitForURL("**/master/kelompok-pajak", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    // Verify row exists in table
    const row = page.getByRole("row", { name: new RegExp(name) })
    await expect(row).toBeVisible({ timeout: 10000 })

    // ─── DELETE ───────────────────────────────────────────────
    // Open action dropdown menu
    await row.getByRole("button", { name: "Menu" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).first().click()

    // Confirm dialog
    await expect(page.getByText("Hapus data ini?")).toBeVisible({ timeout: 5000 })
    await page.getByRole("button", { name: "Hapus" }).click({ timeout: 10000 })

    await page.waitForLoadState("networkidle")

    // Reload and verify gone — retry up to 3x for resilience
    let gone = false
    for (let i = 0; i < 3; i++) {
      await page.goto("/master/kelompok-pajak", { waitUntil: "domcontentloaded" })
      await page.waitForLoadState("networkidle")
      gone = !(await page.locator("body").innerText()).includes(name)
      if (gone) break
      // Still exists — retry delete
      const retryRow = page.getByRole("row", { name: new RegExp(name) })
      if (await retryRow.isVisible().catch(() => false)) {
        await retryRow.getByRole("button", { name: "Menu" }).click()
        await page.getByRole("menuitem", { name: "Hapus" }).first().click()
        await page.getByRole("button", { name: "Hapus" }).click({ timeout: 10000 })
        await page.waitForLoadState("networkidle")
      }
    }
    expect(gone).toBe(true)
  })
})

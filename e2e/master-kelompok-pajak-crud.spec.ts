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


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(5000)
}

async function waitForNavigation(page: Page, url: string | RegExp, { timeout = 20000 } = {}) {
  await Promise.race([page.waitForURL(url, { timeout }), page.waitForLoadState("networkidle")])
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
    await waitForHydration(page)
    await page.getByRole("button", { name: "Simpan" }).click()

    await page.waitForURL("**/master/kelompok-pajak", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    // Search dulu supaya item baru pasti muncul
    await page.locator("input[placeholder*='Cari nama grup pajak']").fill(name)
    await page.waitForTimeout(400)
    await expect(page.locator("body")).toContainText(name)

    // Verify row exists in table (use tr only, avoid div matching)
    const row = page.locator("tr").filter({ hasText: new RegExp(name) }).first()
    await expect(row).toBeVisible({ timeout: 10000 })

    // ─── DELETE ───────────────────────────────────────────────
    // 1. Open dropdown menu
    await row.getByRole("button", { name: "Menu" }).click()
    // 2. Wait for dropdown popover to be visible
    await page.waitForTimeout(5000)
    // 3. Click Hapus menu item
    await page.getByRole("menuitem", { name: "Hapus" }).first().click()
    // 4. Wait for confirm dialog to appear
    await expect(page.getByText("Hapus data ini?")).toBeVisible({ timeout: 5000 })
    // 5. Click confirm Hapus button (inside AlertDialog footer)
    const confirmDialog = page.getByRole('alertdialog', { name: 'Hapus data ini?' })
    await expect(confirmDialog).toBeVisible({ timeout: 5000 })
    await confirmDialog.getByRole("button", { name: /^hapus$/i }).first().click()
    // 6. Wait for network to settle
    await page.waitForTimeout(800)

    // 7. Verify gone — reload the search page directly
    await page.goto(`/master/kelompok-pajak?cari=${encodeURIComponent(name)}`, {
      waitUntil: "domcontentloaded",
    })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(name, { timeout: 15000 })
  })
})

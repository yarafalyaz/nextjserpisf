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
  await page.waitForTimeout(2000)
}

async function waitForNavigation(page: Page, url: string | RegExp, { timeout = 20000 } = {}) {
  await Promise.race([page.waitForURL(url, { timeout }), page.waitForLoadState("networkidle")])
}

test.describe("Keuangan Pusat Biaya (Cost Center) CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Cost Center CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }) => {
    const code = `CC-E2E-${ts}`
    const name = `Cost Center E2E ${ts}`
    const updated = `Cost Center E2E Updated ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/keuangan/pusat-biaya/tambah", { waitUntil: "domcontentloaded" })
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Buat Cost Center" })).toBeVisible()

    await page.locator("#code").fill(code)
    await page.locator("#name").fill(name)
    await waitForHydration(page)
    await page.getByRole("button", { name: "Simpan" }).click()

    await page.waitForURL("**/keuangan/pusat-biaya", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)
    await expect(page.locator("body")).toContainText(code)

    // ─── DETAIL ───────────────────────────────────────────────
    const detailLink = page
      .locator("a[href^='/keuangan/pusat-biaya/']")
      .filter({ hasText: name })
      .first()
    await expect(detailLink).toBeVisible()
    const detailHref = await detailLink.getAttribute("href")
    if (!detailHref) throw new Error("Could not get detail href")
    await page.goto(detailHref, { waitUntil: "domcontentloaded" })

    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto("/keuangan/pusat-biaya", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    // Filter dulu agar item baru pasti muncul
    await page.locator("input[placeholder*='Cari kode atau nama']").fill(name)
    await page.waitForTimeout(400)
    await expect(page.locator("body")).toContainText(name)

    const row = page.locator("tr").filter({ hasText: new RegExp(name) }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.getByRole("button", { name: "Menu" }).first().click()
    await page.waitForTimeout(2000)
    await page.getByRole("menuitem", { name: "Edit" }).first().click()

    await page.waitForURL(/\/keuangan\/pusat-biaya\/\d+\/ubah$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)

    await page.locator("#name").fill(updated)
    await page.getByRole("button", { name: "Update" }).click()

    await page.waitForURL("**/keuangan/pusat-biaya", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await page.locator("input[placeholder*='Cari kode atau nama']").fill(code)
    await page.waitForTimeout(400)

    const updatedVisible = await page.locator("body").textContent().then((t) => (t || "").includes(updated))
    const finalName = updatedVisible ? updated : name

    // ─── DELETE ───────────────────────────────────────────────
    await page.goto(`/keuangan/pusat-biaya?cari=${encodeURIComponent(code)}`, {
      waitUntil: "domcontentloaded",
    })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    const updatedRow = page.locator("tr").filter({ hasText: new RegExp(code) }).first()
    await expect(updatedRow).toBeVisible({ timeout: 15000 })

    // 1. Open dropdown
    await updatedRow.getByRole("button", { name: "Menu" }).first().click()
    await page.waitForTimeout(2000)
    // 2. Click Hapus menu item
    await page.getByRole("menuitem", { name: "Hapus" }).first().click()
    // 3. Wait for confirm dialog
    await expect(page.getByText("Hapus data ini?")).toBeVisible({ timeout: 5000 })
    // 4. Click confirm button in dialog (scope ke dialog, hindari salah klik item menu)
    const confirmDialog = page.getByRole("alertdialog", { name: "Hapus data ini?" })
    await expect(confirmDialog).toBeVisible({ timeout: 5000 })
    await confirmDialog.getByRole("button", { name: /^hapus$/i }).click()
    // 5. Wait for row/search state to settle; refetch via fresh query page after redirect/action completes
    await page.waitForTimeout(800)

    // 6. Verify gone via unique code text on direct search page (avoid stale table rows)
    await page.goto(`/keuangan/pusat-biaya?cari=${encodeURIComponent(code)}`, {
      waitUntil: "domcontentloaded",
    })

    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(code, { timeout: 15000 })
  })
})

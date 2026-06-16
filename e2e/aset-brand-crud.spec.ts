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


test.describe("Aset Brand (Merek) CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Brand Aset CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `brand-e2e-${ts}`
    const updated = `brand-e2e-upd-${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/aset/merek/tambah", { waitUntil: "domcontentloaded" })
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Tambah Merek Aset" })).toBeVisible({ timeout: 30000 })
    await waitForHydration(page)

    const nameInput = page.locator("#name")
    await expect(nameInput).toBeVisible({ timeout: 10000 })
    await nameInput.fill(name)
    await expect(nameInput).toHaveValue(name)
    await page.getByRole("button", { name: /(Simpan|Perbarui|Update)/ }).click()
    await page.waitForURL("**/aset/merek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const createdRow = page.locator("tr").filter({ hasText: name }).first()
    await expect(createdRow).toBeVisible({ timeout: 30000 })
    const linkElement = createdRow.locator("a").filter({ hasText: name }).first()
    const detailHref = await linkElement.getAttribute("href")
    if (!detailHref) throw new Error("Could not find href on detail link")
    await page.goto(new URL(detailHref, page.url()).toString(), { waitUntil: "domcontentloaded" })

    await page.waitForURL(/\/aset\/merek\/\d+$/, { timeout: 30000 })
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto("/aset/merek", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await closeMobileSidebarIfOpen(page)

    const rowForEdit = page.locator("tr").filter({ hasText: name }).first()
    await expect(rowForEdit).toBeVisible({ timeout: 30000 })

    // Open ActionDropdown → Edit
    await rowForEdit.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/aset\/merek\/\d+\/ubah$/, { timeout: 30000 })
    await closeMobileSidebarIfOpen(page)
    await page.locator("#name").fill(updated)
    await waitForHydration(page)
    await page.getByRole("button", { name: /(Simpan|Perbarui|Update)/ }).click()
    await page.waitForURL("**/aset/merek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated }).first()
    await expect(updatedRow).toBeVisible({ timeout: 30000 })

    await updatedRow.getByRole("button", { name: "Menu" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).first().click()

    // Confirm dialog
    const confirmBtn = page.getByRole("button", { name: "Hapus" }).last()
    await expect(confirmBtn).toBeVisible({ timeout: 30000 })
    await confirmBtn.click({ force: true })

    await page.waitForLoadState("networkidle")
    await expect(updatedRow).toHaveCount(0, { timeout: 20000 })
    await expect(page.getByText(updated, { exact: false })).toHaveCount(0, { timeout: 10000 })
  })
})

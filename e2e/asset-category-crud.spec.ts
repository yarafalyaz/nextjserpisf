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
  await page.waitForTimeout(5000)
}


test.describe("Aset Kategori CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Kategori Aset CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `kat-e2e-${ts}`
    const updated = `kat-e2e-upd-${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/aset/kategori/tambah", { waitUntil: "domcontentloaded" })
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Tambah Kategori Aset" })).toBeVisible({ timeout: 15000 })
    await waitForHydration(page)

    const nameInput = page.locator("#name")
    await expect(nameInput).toBeVisible({ timeout: 10000 })
    await nameInput.fill(name)
    await expect(nameInput).toHaveValue(name)
    await page.locator("#code").fill(`KAT-${ts}`)
    await page.locator("#depreciationRate").fill("10")
    await page.locator("#usefulLife").fill("5")
    await page.getByRole("button", { name: /(Simpan|Update)/ }).click()
    await page.waitForURL("**/aset/kategori", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const detailLink = page.getByRole("link", { name }).first()
    await expect(detailLink).toBeVisible({ timeout: 15000 })
    const detailHref = await detailLink.getAttribute("href")
    if (!detailHref) throw new Error("Could not find href on detail link")
    await page.goto(new URL(detailHref, page.url()).toString(), { waitUntil: "domcontentloaded" })

    await page.waitForURL(/\/aset\/kategori\/\d+$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto("/aset/kategori", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await waitForHydration(page)
    await closeMobileSidebarIfOpen(page)

    const row = page.getByRole("row", { name: new RegExp(name) }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.getByRole("button", { name: "Menu" }).click()
    await page.getByRole("menuitem", { name: "Edit" }).first().click()

    await page.waitForURL(/\/aset\/kategori\/\d+\/ubah$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)
    await page.locator("#name").fill(updated)
    await waitForHydration(page)
    await page.getByRole("button", { name: /(Simpan|Update)/ }).click()
    await page.waitForURL("**/aset/kategori", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    const updatedRow = page.getByRole("row", { name: new RegExp(updated) }).first()
    await expect(updatedRow).toBeVisible({ timeout: 15000 })

    await updatedRow.getByRole("button", { name: "Menu" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).first().click()

    await page.getByRole("button", { name: "Hapus" }).last().click()
    await page.waitForLoadState("networkidle")

    await expect(page.getByRole("row", { name: new RegExp(updated) })).toHaveCount(0, { timeout: 15000 })
  })
})

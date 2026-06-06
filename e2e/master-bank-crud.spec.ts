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

  await expect(overlay).toBeHidden()
}


async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(2000)
}


test.describe("Master Bank CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Bank CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `bank-e2e-${ts}`
    const code = `BNK${ts}`
    const updated = `bank-e2e-updated-${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/master/bank/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Tambah Bank" })).toBeVisible({ timeout: 15000 })

    await page.locator("#name").fill(name)
    await page.locator("#code").fill(code)
    await waitForHydration(page)
    await page.locator("button[type='submit']").click()

    await page.waitForURL("**/master/bank", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    // Extract href from link and navigate directly (checkbox intercepts clicks)
    const detailLink = page.getByRole("link", { name }).first()
    await expect(detailLink).toBeVisible({ timeout: 15000 })
    const href = await detailLink.getAttribute("href")
    if (!href) throw new Error("Detail link has no href")

    await page.goto(href, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await waitForHydration(page)
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)
    await expect(page.locator("body")).toContainText(code)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto("/master/bank", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    const row = page.getByRole("row", { name: new RegExp(name) }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.getByRole("button", { name: "Menu" }).click()
    await page.getByRole("menuitem", { name: "Edit" }).first().click()

    await page.waitForURL(/\/master\/bank\/\d+\/ubah$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)
    await waitForHydration(page)
    await page.locator("#name").fill(updated)
    await page.locator("button[type='submit']").click()

    await page.waitForURL("**/master/bank", { timeout: 15000 })
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

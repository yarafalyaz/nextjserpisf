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
  await page.waitForTimeout(2000)
}

async function waitForNavigation(page: Page, url: string | RegExp, { timeout = 20000 } = {}) {
  await Promise.race([page.waitForURL(url, { timeout }), page.waitForLoadState("networkidle")])
}

test.describe("Master Departemen CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Departemen CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }) => {
    const name = `Departemen E2E ${ts}`
    const updated = `Departemen E2E Updated ${ts}`
    const description = `Deskripsi E2E ${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/master/departemen/tambah", { waitUntil: "domcontentloaded" })
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Tambah Departemen" })).toBeVisible()

    await page.locator("#name").fill(name)
    await page.locator("#description").fill(description)
    await waitForHydration(page)
    await page.locator("#submit-department").click()

    await page.waitForURL("**/master/departemen", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const detailLink = page
      .locator("a[href^='/master/departemen/']")
      .filter({ hasText: name })
      .first()
    await expect(detailLink).toBeVisible()
    const detailHref = await detailLink.getAttribute("href")
    if (!detailHref) throw new Error("Could not get detail href")
    await page.goto(detailHref, { waitUntil: "domcontentloaded" })

    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto("/master/departemen", { waitUntil: "domcontentloaded" })
    await closeMobileSidebarIfOpen(page)

    const rowForEdit = page.locator("tr").filter({ hasText: name })
    await expect(rowForEdit).toBeVisible()

    await rowForEdit.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Edit" }).first().click()

    await page.waitForURL(/\/master\/departemen\/\d+\/ubah$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)
    await page.locator("#name").fill(updated)
    await waitForHydration(page)
    await page.locator("button[type='submit']").click()

    await page.waitForURL("**/master/departemen", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible()

    await updatedRow.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()

    const confirmBtn = page.locator("button").filter({ hasText: "Hapus" }).last()
    await expect(confirmBtn).toBeVisible()
    await confirmBtn.click({ force: true })

    await page.waitForLoadState("networkidle")
    await expect(updatedRow).toBeHidden({ timeout: 15000 })
    await expect(page.locator("body")).not.toContainText(updated, { timeout: 5000 })
  })
})

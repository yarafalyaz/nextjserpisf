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

test.describe("Master Syarat Pembayaran CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Syarat Pembayaran CRUD khusus desktop")
  })

  test("create → delete", async ({ page }) => {
    const name = `Termin E2E ${ts}`
    const code = `E2E${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/master/syarat-pembayaran/tambah", {
      waitUntil: "domcontentloaded",
    })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    await expect(
      page.getByRole("heading", { name: "Tambah Termin Pembayaran" })
    ).toBeVisible()

    await page.locator("#name").fill(name)
    await page.locator("#code").fill(code)
    await page.locator("#days").fill("14")

    await waitForHydration(page)
    await page.getByRole("button", { name: "Simpan" }).click()

    await page.waitForURL("**/master/syarat-pembayaran", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    // Verify row exists in table — try getByRole first, fallback to getByText
    let row = page.getByRole("row", { name: new RegExp(name) })
    if (!(await row.isVisible().catch(() => false))) {
      // Fallback: find via text then navigate to parent row
      row = page.getByText(name).locator("xpath=ancestor::tr")
    }
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
      await page.goto("/master/syarat-pembayaran", {
        waitUntil: "domcontentloaded",
      })
      await page.waitForLoadState("networkidle")
      gone = !(await page.locator("body").innerText()).includes(name)
      if (gone) break
      // Still exists — retry delete
      const retryText = page.getByText(name)
      if (await retryText.isVisible().catch(() => false)) {
        const retryRow = retryText.locator("xpath=ancestor::tr")
        await retryRow.getByRole("button", { name: "Menu" }).click()
        await page.getByRole("menuitem", { name: "Hapus" }).first().click()
        await page.getByRole("button", { name: "Hapus" }).click({ timeout: 10000 })
        await page.waitForLoadState("networkidle")
      }
    }
    expect(gone).toBe(true)
  })
})

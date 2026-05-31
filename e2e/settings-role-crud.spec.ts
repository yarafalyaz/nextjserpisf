import { expect, test, type Page } from "@playwright/test"
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

test.describe("Pengaturan Peran CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Role CRUD khusus desktop; sidebar overlay intercepts clicks on mobile")
  })

  test("create → detail → update → delete", async ({ page }) => {
    const name = `role-e2e-${ts}`
    const updated = `role-e2e-updated-${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/pengaturan/peran/tambah", { waitUntil: "domcontentloaded" })
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Tambah Role" })).toBeVisible()
    await page.locator("#name").fill(name)
    await page.locator("button[type='submit']").click()

    await page.waitForURL("**/pengaturan/peran", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const createdRow = page.locator("tr").filter({ hasText: name })
    await expect(createdRow).toBeVisible()
    await createdRow.locator("a").filter({ hasText: "Detail" }).click({ force: true })

    await page.waitForURL(/\/pengaturan\/peran\/\d+$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading").filter({ hasText: name }).first()).toBeVisible()

    // ─── UPDATE ───────────────────────────────────────────────
    await page.getByRole("link", { name: "Edit Role" }).click({ force: true })
    await page.waitForURL(/\/pengaturan\/peran\/\d+\/ubah$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)
    await page.locator("#name").fill(updated)
    await page.locator("button[type='submit']").click()

    await page.waitForURL("**/pengaturan/peran", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ───────────────────────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible()

    const hapusButton = updatedRow.locator("button", { hasText: "Hapus" })
    await expect(hapusButton).toBeVisible()

    // Server action deletes then redirects to same URL — wait for response, then verify row gone
    const [_response] = await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes("/pengaturan/peran") && resp.status() < 400,
        { timeout: 15000 }
      ),
      hapusButton.click({ force: true }),
    ]).catch(() => [null])

    // Wait for the page to fully re-render after server action redirect
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(updatedRow).toBeHidden({ timeout: 15000 })
    await expect(page.locator("body")).not.toContainText(updated, { timeout: 5000 })
  })
})


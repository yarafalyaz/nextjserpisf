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

test.describe("CRM Leads CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Leads CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }) => {
    const name = `lead-e2e-${ts}`
    const email = `lead-e2e-${ts}@test.com`
    const company = `PT E2E ${ts}`
    const updated = `lead-e2e-updated-${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/crm/leads/tambah", { waitUntil: "domcontentloaded" })
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Tambah Lead" })).toBeVisible()

    await page.locator("#name").fill(name)
    await page.locator("#email").fill(email)
    await page.locator("#company").fill(company)
    await page.locator("button[type='submit']").click()

    await page.waitForURL("**/crm/leads", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const createdRow = page.locator("tr").filter({ hasText: name })
    await expect(createdRow).toBeVisible()
    await createdRow.locator("a").filter({ hasText: name }).click({ force: true })

    await page.waitForURL(/\/crm\/leads\/\d+$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)
    await expect(page.locator("body")).toContainText(email)

    // ─── UPDATE ───────────────────────────────────────────────
    await page.goto("/crm/leads", { waitUntil: "domcontentloaded" })
    await closeMobileSidebarIfOpen(page)

    const rowForEdit = page.locator("tr").filter({ hasText: name })
    await expect(rowForEdit).toBeVisible()

    // Open ActionDropdown → Edit
    await rowForEdit.locator("button[aria-label='Menu']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Edit" }).first().click()

    await page.waitForURL(/\/crm\/leads\/\d+\/ubah$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)
    await page.locator("#name").fill(updated)
    await page.locator("button[type='submit']").click()

    await page.waitForURL("**/crm/leads", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE (via detail page) ─────────────────────────────
    // Navigate to detail page — no delete action on list dropdown
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible()
    await updatedRow.locator("a").filter({ hasText: updated }).click({ force: true })

    await page.waitForURL(/\/crm\/leads\/\d+$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)

    // Click delete button (trash icon with danger variant)
    await page.locator("button").filter({ has: page.locator("svg") }).last().click({ force: true })

    // Confirm dialog
    const confirmBtn = page.locator("[role='dialog'], [data-dialog]").locator("button").filter({ hasText: "Hapus" })
    if (await confirmBtn.isVisible().catch(() => false)) {
      await confirmBtn.click({ force: true })
    } else {
      // Fallback: find Hapus button in any dialog-like overlay
      await page.locator("button").filter({ hasText: "Hapus" }).last().click({ force: true })
    }

    await page.waitForURL("**/crm/leads", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).not.toContainText(updated, { timeout: 15000 })
  })
})

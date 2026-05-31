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
    const detailLink = page.getByRole("link", { name }).first()
    await expect(detailLink).toBeVisible()
    const href = await detailLink.getAttribute("href")
    if (!href) throw new Error("Detail link has no href")

    await page.goto(href, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)
    await expect(page.locator("body")).toContainText(email)

    // ─── UPDATE ───────────────────────────────────────────────
    // Go back to list, open edit from dropdown
    await page.goto("/crm/leads", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    const row = page.getByRole("row", { name: new RegExp(name) })
    await expect(row).toBeVisible()
    await row.getByRole("button", { name: "Menu" }).click()
    await page.getByRole("menuitem", { name: "Edit" }).first().click()

    await page.waitForURL(/\/crm\/leads\/\d+\/ubah$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)
    await page.locator("#name").fill(updated)
    await page.locator("button[type='submit']").click()

    await page.waitForURL("**/crm/leads", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE via detail page ──────────────────────────────
    // Find the link in the table row (not breadcrumb)
    const updatedRow = page.getByRole("row", { name: new RegExp(updated) })
    await expect(updatedRow).toBeVisible()
    const updatedHref = await updatedRow.getByRole("link").first().getAttribute("href")
    if (!updatedHref) throw new Error("Updated row link has no href")

    await page.goto(updatedHref, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    // Find delete button — it's a danger-variant button with Trash2 icon in actions area
    // Use the actions container (div with gap-2 that contains Edit link and buttons)
    const actionsArea = page.locator("div.flex.items-center.gap-2").first()
    // The delete button is the button (not link) in the actions area
    const deleteBtn = actionsArea.locator("button").first()
    await expect(deleteBtn).toBeVisible({ timeout: 5000 })
    await deleteBtn.click()

    // Confirm dialog — the ConfirmDialog has a Hapus button
    await expect(page.getByText("Hapus data ini?")).toBeVisible({ timeout: 5000 })
    await page.getByRole("button", { name: "Hapus" }).click()

    await page.waitForURL("**/crm/leads", { timeout: 15000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).not.toContainText(updated, { timeout: 15000 })
  })
})

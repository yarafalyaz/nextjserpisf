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


test.describe("CRM Leads CRUD", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Leads CRUD khusus desktop")
  })

  test("create → detail → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `lead-e2e-${ts}`
    const email = `lead-e2e-${ts}@test.com`
    const company = `PT E2E ${ts}`
    const updated = `lead-e2e-updated-${ts}`

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/crm/leads/tambah", { waitUntil: "domcontentloaded" })
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Tambah Lead" })).toBeVisible({ timeout: 15000 })
    await waitForHydration(page)

    const nameInput = page.locator("#name")
    await expect(nameInput).toBeVisible({ timeout: 10000 })
    await nameInput.fill(name)
    await expect(nameInput).toHaveValue(name)
    await page.locator("#email").fill(email)
    await page.locator("#company").fill(company)
    await page.locator("button[type='submit']").click()
    await page.waitForURL("**/crm/leads", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const detailLink = page.getByRole("link", { name }).first()
    await expect(detailLink).toBeVisible({ timeout: 15000 })
    const href = await detailLink.getAttribute("href")
    if (!href) throw new Error("Detail link has no href")

    await page.goto(href, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await waitForHydration(page)
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(name)
    await expect(page.locator("body")).toContainText(email)

    // ─── UPDATE ───────────────────────────────────────────────
    // Go back to list, open edit from dropdown
    await page.goto("/crm/leads", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    const row = page.getByRole("row", { name: new RegExp(name) }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.getByRole("button", { name: "Menu" }).click()
    await page.getByRole("menuitem", { name: "Edit" }).first().click()

    await page.waitForURL(/\/crm\/leads\/\d+\/ubah$/, { timeout: 15000 })
    await closeMobileSidebarIfOpen(page)
    await waitForHydration(page)
    await page.locator("#name").fill(updated)
    await page.locator("button[type='submit']").click()
    await page.waitForURL("**/crm/leads", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE via detail page ──────────────────────────────
    // Buka detail terbaru yang match nama tepat
    const updatedRow = page.getByRole("row", { name: new RegExp(updated) }).first()
    await expect(updatedRow).toBeVisible({ timeout: 15000 })
    const updatedHref = await updatedRow.getByRole("link", { name: updated }).first().getAttribute("href")
    if (!updatedHref) throw new Error("Updated row link has no href")

    await page.goto(updatedHref, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await waitForHydration(page)
    await closeMobileSidebarIfOpen(page)

    // Hapus via tombol dengan aria-label (komponen DeleteButton)
    const triggerHapus = page.locator("button[aria-label='Hapus'], button:has-text('Hapus')").last()
    await expect(triggerHapus).toBeVisible({ timeout: 15000 })
    await triggerHapus.click()

    // Tunggu dialog muncul, lalu klik tombol Hapus di dalamnya
    await expect(page.getByText("Hapus data ini?")).toBeVisible({ timeout: 5000 })
    // Dialog punya confirm button “Hapus” (HeroUI AlertDialog)
    const confirmDelete = page.getByRole("button", { name: "Hapus" }).last()
    await expect(confirmDelete).toBeVisible({ timeout: 5000 })
    await confirmDelete.click({ force: true })

    // Tunggu dialog tertutup + server action selesai
    await expect(page.getByText("Hapus data ini?")).toBeHidden({ timeout: 10000 })

    // Force refresh list + verifikasi data unik (email) sudah hilang
    await page.goto("/crm/leads", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await waitForHydration(page)
    await closeMobileSidebarIfOpen(page)
    await expect(page.locator("body")).not.toContainText(email, { timeout: 15000 })
  })
})

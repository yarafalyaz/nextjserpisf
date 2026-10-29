import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

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
    await expect(page.getByRole("heading", { name: "Tambah Prospek" })).toBeVisible({ timeout: 30000 })
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30_000 })

    const nameInput = page.locator("#name")
    await expect(nameInput).toBeVisible({ timeout: 10000 })
    await nameInput.fill(name)
    await expect(nameInput).toHaveValue(name)
    await page.locator("#email").fill(email)
    await page.locator("#company").fill(company)
    await page.locator("button[type='submit']").click()
    await page.waitForURL("**/crm/leads", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── DETAIL ───────────────────────────────────────────────
    const detailLink = page.getByRole("link", { name }).first()
    await expect(detailLink).toBeVisible({ timeout: 30000 })
    const href = await detailLink.getAttribute("href")
    if (!href) throw new Error("Detail link has no href")

    await page.goto(href, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name, { timeout: 30_000 })
    await expect(page.locator("body")).toContainText(email)

    // ─── UPDATE ───────────────────────────────────────────────
    // Go back to list, open edit from dropdown
    await page.goto("/crm/leads", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    const row = page.getByRole("row", { name: new RegExp(name) }).first()
    await expect(row).toBeVisible({ timeout: 30000 })
    await row.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/crm\/leads\/[^/]+\/ubah$/, { timeout: 30000 })
    await expect(page.locator("#name")).toBeVisible({ timeout: 30_000 })
    await page.locator("#name").fill(updated)
    await page.locator("button[type='submit']").click()
    await page.waitForURL("**/crm/leads", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE via detail page ──────────────────────────────
    // Buka detail terbaru yang match nama tepat
    const updatedRow = page.getByRole("row", { name: new RegExp(updated) }).first()
    await expect(updatedRow).toBeVisible({ timeout: 30000 })
    const updatedHref = await updatedRow.getByRole("link", { name: updated }).first().getAttribute("href")
    if (!updatedHref) throw new Error("Updated row link has no href")

    await page.goto(updatedHref, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated, { timeout: 30_000 })

    // Hapus via tombol dengan aria-label (komponen DeleteButton)
    const triggerHapus = page.locator("button[aria-label='Hapus'], button:has-text('Hapus')").last()
    await expect(triggerHapus).toBeVisible({ timeout: 30000 })
    await triggerHapus.click()

    // Tunggu dialog muncul, lalu klik tombol Hapus di dalamnya.
    // `.first()`: judul yang sama juga dipakai oleh ConfirmDialog di
    // `delete-button.tsx` dan `action-dropdown.tsx`, jadi tanpa ini locator
    // bisa kena strict-mode violation saat keduanya sempat ter-mount.
    await expect(page.getByText("Hapus data ini?").first()).toBeVisible({ timeout: 5000 })
    // Dialog punya confirm button “Hapus” (HeroUI AlertDialog)
    const confirmDelete = page.getByRole("button", { name: "Hapus" }).last()
    await expect(confirmDelete).toBeVisible({ timeout: 5000 })
    await confirmDelete.click({ force: true })

    // Tunggu dialog tertutup + server action selesai
    await expect(page.getByText("Hapus data ini?").first()).toBeHidden({ timeout: 10000 })

    // Force refresh list + verifikasi data unik (email) sudah hilang
    await page.goto("/crm/leads", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("table").first()).toBeVisible({ timeout: 30_000 })
    await expect(page.locator("body")).not.toContainText(email, { timeout: 30000 })
  })
})

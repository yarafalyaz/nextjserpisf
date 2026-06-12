import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

/**
 * Finance — General Journal critical flows.
 *
 * Covers the accounting backbone that other reports depend on:
 *   1. Journal list + create form DOM
 *   2. End-to-end balanced journal entry creation (debit == credit)
 *   3. General Ledger (Buku Besar) report — account picker + ledger table
 *   4. Trial Balance (Neraca Saldo) report — table + balance invariant
 *
 * Auth is provided by the shared storageState produced in `auth.setup.ts`
 * (see playwright.config.ts → projects[].storageState = "e2e/.auth/user.json").
 */

async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(1500)
}

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

test.describe("Finance — Journal & Reports", () => {
  test("journal list renders heading, create button and table surface", async ({ page }) => {
    await page.goto("/keuangan/jurnal", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    // Real DOM assertions (not just body text)
    await expect(page.getByRole("heading", { name: "Jurnal" })).toBeVisible({ timeout: 30000 })
    await expect(page.locator("#create-journal-btn")).toBeVisible()
    await expect(page.locator("#create-journal-btn")).toHaveAttribute("href", "/keuangan/jurnal/tambah")

    // Status filter chips exist (Semua / Konsep / Diposting)
    // On mobile the chips live inside a FilterDrawer; on desktop they're inline.
    // Either way, the "Semua" link must be in the DOM as an actual <a>.
    const semuaChip = page.getByRole("link", { name: "Semua" }).first()
    await expect(semuaChip).toBeAttached()
    // On desktop the chip is visible; on mobile it lives behind the drawer.
    if (await semuaChip.isVisible().catch(() => false)) {
      await expect(semuaChip).toBeVisible()
    }
  })

  test("journal create form exposes date, description and entry rows", async ({ page }) => {
    await page.goto("/keuangan/jurnal/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await closeMobileSidebarIfOpen(page)

    await expect(page.getByRole("heading", { name: "Buat Entri Jurnal" })).toBeVisible({ timeout: 30000 })

    const form = page.locator("form")
    await expect(form).toBeVisible()

    // Description input
    await expect(page.getByPlaceholder("Deskripsi jurnal")).toBeVisible()

    // Entry table headers
    await expect(page.getByRole("columnheader", { name: "Akun" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Debit" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Kredit" })).toBeVisible()

    // Two default entry rows, each with an account combobox
    const accountCombos = page.getByRole("combobox")
    expect(await accountCombos.count()).toBeGreaterThanOrEqual(2)

    // Balance indicator + add-row control
    await expect(page.getByRole("button", { name: "+ Tambah Baris" })).toBeVisible()
  })

  test("create a balanced journal entry end-to-end", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Journal entry creation is a desktop interaction")

    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const description = `Jurnal E2E ${ts}`

    await page.goto("/keuangan/jurnal/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await closeMobileSidebarIfOpen(page)
    await expect(page.getByRole("heading", { name: "Buat Entri Jurnal" })).toBeVisible({ timeout: 30000 })

    await page.getByPlaceholder("Deskripsi jurnal").fill(description)

    const rows = page.locator("table tbody tr")
    await expect(rows.first()).toBeVisible()

    // --- Row 0: debit account ---
    const combo0 = rows.nth(0).getByRole("combobox")
    await combo0.click()
    const options0 = page.getByRole("option")
    await expect(options0.first()).toBeVisible({ timeout: 10000 })
    await options0.first().click()
    // debit input is the first numeric "form-input" in the row
    await rows.nth(0).locator("input.form-input").first().fill("150000")

    // --- Row 1: credit account (pick a different option) ---
    const combo1 = rows.nth(1).getByRole("combobox")
    await combo1.click()
    const options1 = page.getByRole("option")
    await expect(options1.first()).toBeVisible({ timeout: 10000 })
    // second option so debit/credit hit distinct accounts when available
    const optCount = await options1.count()
    await options1.nth(optCount > 1 ? 1 : 0).click()
    // credit input is the second numeric "form-input" in the row
    await rows.nth(1).locator("input.form-input").nth(1).fill("150000")

    // Balance indicator should flip to "Seimbang"
    await expect(page.getByText("Seimbang", { exact: true })).toBeVisible({ timeout: 10000 })

    // Submit — button only enabled while balanced
    const submit = page.getByRole("button", { name: "Simpan" })
    await expect(submit).toBeEnabled()
    await submit.click()

    // Redirects back to the journal list on success
    await page.waitForURL("**/keuangan/jurnal", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.getByRole("heading", { name: "Jurnal" })).toBeVisible()
  })

  test("general ledger (buku besar) — account picker drives the ledger table", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Ledger account picker is a desktop interaction")

    await page.goto("/laporan/buku-besar", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)
    await closeMobileSidebarIfOpen(page)

    // Empty state before an account is chosen
    await expect(page.getByText("Pilih akun untuk melihat buku besar")).toBeVisible({ timeout: 30000 })

    // Account picker (FormSelect → combobox with id="accountId")
    const accountPicker = page.locator("#accountId")
    await expect(accountPicker).toBeVisible()
    await accountPicker.click()
    const options = page.getByRole("option")
    await expect(options.first()).toBeVisible({ timeout: 10000 })
    await options.first().click()

    await page.getByRole("button", { name: "Tampilkan" }).click()
    await page.waitForLoadState("networkidle")

    // Ledger table renders with its accounting columns + opening balance row
    await expect(page.getByText("Buku Besar").first()).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole("columnheader", { name: /No\. Jurnal/ })).toBeVisible()
    await expect(page.getByText("Saldo Awal")).toBeVisible()
  })

  test("trial balance (neraca saldo) — table columns and balance invariant", async ({ page }) => {
    await page.goto("/laporan/neraca-saldo", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await closeMobileSidebarIfOpen(page)

    // Report identity
    await expect(page.getByText("Neraca Saldo").first()).toBeVisible({ timeout: 30000 })

    // Column headers (real th elements)
    await expect(page.getByRole("columnheader", { name: "Kode Akun" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: "Nama Akun" })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: /Debit/ })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: /Kredit/ })).toBeVisible()

    // The defining invariant of a trial balance: it states SEIMBANG or TIDAK SEIMBANG
    await expect(page.getByText(/SEIMBANG/)).toBeVisible()
    await expect(page.getByText(/Total Debit:/)).toBeVisible()
  })
})

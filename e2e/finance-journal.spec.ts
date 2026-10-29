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
  // Tanpa sleep: assertion web-first sesudah ini (heading/form/combobox
  // toBeVisible timeout 30s) yang menunggu hydration selesai.
}

test.describe("Finance — Journal & Reports", () => {
  test("journal list renders heading, create button and table surface", async ({ page }) => {
    await page.goto("/keuangan/jurnal", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    // Real DOM assertions (not just body text)
    await expect(page.getByRole("heading", { name: "Jurnal" })).toBeVisible({ timeout: 30000 })
    await expect(page.locator("#create-journal-btn")).toBeVisible()
    await expect(page.locator("#create-journal-btn")).toHaveAttribute("href", "/keuangan/jurnal/tambah")

    // Status filter chips exist (Semua / Konsep / Diposting).
    // Desktop: rendered inline (lg:flex). Mobile: inside the FilterDrawer, and the
    // Radix Sheet does not mount its content while closed - so on a small viewport
    // the chips are neither in the a11y tree (the desktop copy is display:none via
    // `hidden lg:flex`) nor attached. Open the drawer first when it is present.
    const drawerTrigger = page.getByRole("button", { name: /Buka filter laci/i })
    if (await drawerTrigger.isVisible().catch(() => false)) {
      await drawerTrigger.click()
    }
    // `exact: true`: nama chip adalah tepat "Semua", jadi jangan biarkan
    // pencocokan substring menangkap teks lain yang memuat kata itu.
    const semuaChip = page.getByRole("link", { name: "Semua", exact: true }).first()
    await expect(semuaChip).toBeAttached()
    await expect(semuaChip).toBeVisible()
  })

  test("journal create form exposes date, description and entry rows", async ({ page }) => {
    await page.goto("/keuangan/jurnal/tambah", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)

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
    await expect(page.getByRole("heading", { name: "Buat Entri Jurnal" })).toBeVisible({ timeout: 30000 })

    await page.getByPlaceholder("Deskripsi jurnal").fill(description)

    const rows = page.locator("table tbody tr")
    await expect(rows.first()).toBeVisible()

    // --- Row 0: debit account ---
    const combo0 = rows.nth(0).getByRole("combobox")
    await combo0.click()
    // DIBATASI ke listbox yang terbuka: `<option>` pada <select> native juga ber-role
    // "option", jadi `page.getByRole("option")` global ikut menangkap pilihan
    // "Pusat Laba" di header form (muncul lebih dulu di DOM, dan tidak terlihat) —
    // itu membuat tes ini merah padahal alur jurnalnya sendiri sehat.
    const options0 = page.getByRole("listbox").getByRole("option")
    await expect(options0.first()).toBeVisible({ timeout: 10000 })
    await options0.first().click()
    // Input debit = textbox pertama di baris ini (akun memakai role combobox).
    await rows.nth(0).getByRole("textbox").first().fill("150000")

    // --- Row 1: credit account (pick a different option) ---
    const combo1 = rows.nth(1).getByRole("combobox")
    await combo1.click()
    const options1 = page.getByRole("listbox").getByRole("option")
    await expect(options1.first()).toBeVisible({ timeout: 10000 })
    // second option so debit/credit hit distinct accounts when available
    const optCount = await options1.count()
    await options1.nth(optCount > 1 ? 1 : 0).click()
    // Input kredit = textbox kedua di baris ini (index 0 = debit).
    await rows.nth(1).getByRole("textbox").nth(1).fill("150000")

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

    // Empty state before an account is chosen
    await expect(page.getByText("Pilih akun untuk melihat buku besar")).toBeVisible({ timeout: 30000 })

    // Pemilih akun kini milik `ReportPeriodFilter` (Combobox ber-id `filter-akun`);
    // filter tetap diterapkan lewat tombol "Tampilkan".
    const accountPicker = page.locator("#filter-akun")
    await expect(accountPicker).toBeVisible()
    await accountPicker.click()
    const options = page.getByRole("listbox").getByRole("option")
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

    // Report identity
    await expect(page.getByText("Neraca Saldo").first()).toBeVisible({ timeout: 30000 })

    // Column headers (real th elements). Case-insensitive: the report styles its
    // headers as uppercase, so the rendered text is "KODE / NAMA AKUN" — this used
    // to hardcode "Kode Akun", which no longer matched once the headers were
    // restyled (the spec only failed once there was data to render, so an empty
    // dev DB hid it).
    await expect(page.getByRole("columnheader", { name: /kode/i })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: /nama akun/i })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: /debit/i })).toBeVisible()
    await expect(page.getByRole("columnheader", { name: /kredit/i })).toBeVisible()

    // The defining invariant of a trial balance: the totals row must balance.
    // (This used to assert the literal text "SEIMBANG" / "Total Debit:", which the
    // report no longer renders — it now ends with a "Total" row whose debit and
    // credit columns must be equal. Asserting the numbers keeps the invariant.)
    const totalRow = page.locator("tbody tr").filter({ hasText: /Total/i }).last()
    await expect(totalRow).toBeVisible()
    const totalCells = await totalRow.locator("td").allInnerTexts()
    const keAngka = (teks: string) =>
      Number(teks.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "")) || 0
    const totalDebit = keAngka(totalCells[totalCells.length - 2] ?? "")
    const totalKredit = keAngka(totalCells[totalCells.length - 1] ?? "")
    expect(totalDebit).toBeGreaterThan(0)
    expect(totalKredit).toBe(totalDebit)
  })
})

test.describe("Buku Besar — drill-down jurnal/referensi F-2026-10-20-31", () => {
  test("kolom Referensi tampil; No. Jurnal tertaut ke detail jurnal bila ada baris", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Ledger drill-down is a desktop interaction")

    await page.goto("/laporan/buku-besar", { waitUntil: "domcontentloaded" })
    await waitForHydration(page)

    const accountPicker = page.locator("#filter-akun")
    await expect(accountPicker).toBeVisible()
    await accountPicker.click()
    const options = page.getByRole("listbox").getByRole("option")
    await expect(options.first()).toBeVisible({ timeout: 10000 })
    await options.first().click()
    await page.getByRole("button", { name: "Tampilkan" }).click()
    await page.waitForLoadState("networkidle")

    await expect(page.getByRole("columnheader", { name: /Referensi/ })).toBeVisible({ timeout: 30000 })
    // Bila periode punya baris jurnal, No. Jurnal pertama harus tautan ke detail.
    const journalLink = page.getByRole("link", { name: /Lihat jurnal / }).first()
    if (await journalLink.count()) {
      await expect(journalLink).toHaveAttribute("href", /\/keuangan\/jurnal\//)
    }
  })
})

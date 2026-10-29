import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"
import { awaitReady } from "./utils/await-ready"

test.describe("Master Kelompok Pajak CRUD", () => {
  test.beforeEach(async ({ }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Kelompok Pajak CRUD khusus desktop")
  })

  test("create → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Grup E2E ${ts}`
    const taxName = `PPN E2E ${ts}`

    // Kelompok wajib berisi minimal satu pajak (validasi createTaxGroup) dan
    // DB uji bisa kosong pajaknya — buat satu pajak dulu lewat UI.
    await page.goto("/master/pajak/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("heading", { name: "Tambah Pajak" })).toBeVisible({ timeout: 30000 })
    await page.locator("#tax-name").fill(taxName)
    await page.locator("#tax-rate").fill("11")
    await page.locator("#submit-tax").click()
    await page.waitForURL("**/master/pajak", { timeout: 30000 })

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/master/kelompok-pajak/tambah", { waitUntil: "domcontentloaded" })
    await awaitReady(page, "form")
    await expect(page.getByRole("heading", { name: "Tambah Grup Pajak" })).toBeVisible({ timeout: 30000 })

    await page.locator("#name").fill(name)
    await page.getByRole("checkbox").first().check()
    await expect(page.getByRole("button", { name: "Simpan" })).toBeEnabled({ timeout: 15_000 })
    await page.getByRole("button", { name: "Simpan" }).click()

    await page.waitForURL("**/master/kelompok-pajak", { timeout: 30000 })
    await page.waitForLoadState("networkidle")

    // Search dulu supaya item baru pasti muncul
    await page.locator("input[placeholder*='Cari nama grup pajak']").fill(name)
    await expect(page.locator("body")).toContainText(name)

    // Verify row exists in table (use tr only, avoid div matching)
    const row = page.locator("tr").filter({ hasText: new RegExp(name) }).first()
    await expect(row).toBeVisible({ timeout: 10000 })

    // ─── DELETE ───────────────────────────────────────────────
    // 1. Open dropdown menu
    await row.getByRole("button", { name: "Buka menu aksi" }).click()
    // 2. Tunggu dropdown popover ter-render (web-first, bukan sleep buta).
    await expect(page.getByRole("menuitem", { name: "Hapus" }).first()).toBeVisible({ timeout: 10_000 })
    // 3. Click Hapus menu item
    await page.getByRole("menuitem", { name: "Hapus" }).first().click()
    // 4. Wait for confirm dialog to appear (`.first()` — teks judul ini juga
    //    muncul di ConfirmDialog delete-button.tsx / action-dropdown.tsx).
    await expect(page.getByText("Hapus data ini?").first()).toBeVisible({ timeout: 5000 })
    // 5. Click confirm Hapus button (inside AlertDialog footer)
    const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasText: 'Hapus data ini?' }).first()
    await expect(confirmDialog).toBeVisible({ timeout: 5000 })
    await confirmDialog.getByRole("button", { name: /^hapus$/i }).first().click()

    // 6. Verify gone — reload the search page directly (assertion web-first di bawah)
    await page.goto(`/master/kelompok-pajak?cari=${encodeURIComponent(name)}`, {
      waitUntil: "domcontentloaded",
    })
    await expect(page.locator("table").first()).toBeVisible({ timeout: 30_000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).not.toContainText(name, { timeout: 30000 })

    // Bersihkan pajak yang dibuat di awal spec ini.
    await page.goto("/master/pajak", { waitUntil: "domcontentloaded" })
    await expect(page.locator("table").first()).toBeVisible({ timeout: 30_000 })
    const taxRow = page.getByRole("row", { name: new RegExp(taxName) }).first()
    await expect(taxRow).toBeVisible({ timeout: 30000 })
    await taxRow.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).first().click()
    await page.getByRole("button", { name: "Hapus" }).last().click()
    await expect(page.getByRole("row", { name: new RegExp(taxName) })).toHaveCount(0, { timeout: 30000 })
  })
})

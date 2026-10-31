import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"
import { selectComboboxOptionBySearch, selectFirstComboboxOption } from "./utils/combobox"
import { awaitReady } from "./utils/await-ready"


test.beforeEach(async ({}, testInfo) => {
  skipOnMobile(testInfo.project.name)
})


test.describe("Proyek CRUD", () => {
  test("create → update → delete", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `Proyek E2E ${ts}`
    const updated = `Proyek E2E Updated ${ts}`
    const desc = "Deskripsi proyek e2e"
    const updatedDesc = "Deskripsi proyek e2e updated"

    // ─── CREATE ────────────────────────────────────────────────
    await page.goto("/proyek/tambah", { waitUntil: "domcontentloaded" })
    await awaitReady(page)

    // Filter "E2E" dulu (seed CI), fallback opsi pertama tanpa filter —
    // helper bersama combobox.ts, bukan duplikat lokal + sleep.
    const selected =
      (await selectComboboxOptionBySearch(page, { placeholder: "Cari pelanggan..." }, "E2E")) ||
      (await selectFirstComboboxOption(page, { placeholder: "Cari pelanggan..." }))
    if (!selected) {
      // CI seeds an "E2E Customer" via scripts/seed-remaining-e2e.ts, so an empty
      // picker means the fixture/seed regressed. Failing here keeps the project
      // create -> detail -> delete flow from silently vanishing from CI.
      throw new Error("Fixture hilang: tidak ada pelanggan untuk dipilih (cek scripts/seed-remaining-e2e.ts)")
    }

    // Filter "E2E" tak cocok dengan nama pelanggan yang ada (cmdk memfilter
    // SENDIRI di klien terhadap seluruh label opsi), jadi opsi tak pernah
    // muncul: fallback 'Enter' via keyboard tanpa opsi aktif tak melakukan
    // apa pun, customerId tetap kosong, dan createProject menolak senyap
    // (customerId wajib ≥1).
    // Buktikan seleksi terikat (hidden input terisi); bila belum, bersihkan
    // filter lalu pilih ulang opsi pertama.
    const customerIdInput = page.locator("input[name='customerId']")
    if ((await customerIdInput.inputValue()) === "") {
      // Tutup popup (Escape), kosongkan filter lewat pemicu, buka lagi,
      // lalu keyboard pilih opsi pertama. Popup pendahulu masih membuka
      // port kap (filter "E2E" kosong) jadi pemanggilan helper kedua kalinya
      // menekan pemicu YANG SAMA dan MENUTUPNYA alih-alih membuka opsi baru.
      // State filter combobox membersihkan sendiri sesudah pilihan dibuat.
      await page.keyboard.press("Escape")
      const trigger2 = page
        .getByRole("combobox")
        .filter({ hasText: /Cari pelanggan|Pilih pelanggan/ })
        .first()
      await trigger2.click()
      const searchInput = page.locator("input[placeholder='Cari pelanggan...']").first()
      if ((await searchInput.count()) > 0) await searchInput.fill("")
      const opt = page.getByRole("listbox").getByRole("option").first()
      await opt.waitFor({ state: "visible", timeout: 10000 }).catch(() => undefined)
      // Keyboard: cmdk men-highlight opsi aktif sesudah filter bersih;
      // mengklik CommandItem secara programatik bisa kalah dari hidrasi.
      await page.keyboard.press("ArrowDown")
      await page.keyboard.press("Enter")
    }
    await expect(customerIdInput).toHaveValue(/\d+/, { timeout: 15000 })

    await page.locator("#name").first().fill(name)
    await page.locator("#description").first().fill(desc)
    await page.getByRole("button", { name: "Simpan Proyek" }).click()
    await page.waitForURL("**/proyek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(name)

    // ─── UPDATE ────────────────────────────────────────────────
    const row = page.locator("tr").filter({ hasText: name })
    await expect(row).toBeVisible({ timeout: 30000 })
    await row.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: /Edit|Ubah/ }).first().click()

    await page.waitForURL(/\/proyek\/[^/]+\/ubah/, { timeout: 20000 })
    await page.waitForLoadState("networkidle")

    await page.locator("#name").first().fill(updated)
    await page.locator("#description").first().fill(updatedDesc)
    await page.getByRole("button", { name: /Update|Perbarui/ }).first().click()
    await page.waitForURL("**/proyek", { timeout: 30000 })
    await page.waitForLoadState("networkidle")
    await expect(page.locator("body")).toContainText(updated)

    // ─── DELETE ────────────────────────────────────────────────
    const updatedRow = page.locator("tr").filter({ hasText: updated })
    await expect(updatedRow).toBeVisible({ timeout: 30000 })
    await updatedRow.locator("button[aria-label='Buka menu aksi']").click()
    await page.locator("[role='menuitem']").filter({ hasText: "Hapus" }).first().click()
    // Menu "Hapus" membuka ConfirmDialog (AlertDialog): tombol konfirmasi
    // berscope dialog, bukan tombol "Hapus" terakhir di halaman (bisa
    // menuitem yang sama yang menahan dialog terbuka).
    const confirmDialog = page
      .locator('[role="alertdialog"], [role="dialog"]')
      .filter({ hasText: "Hapus data ini?" })
      .first()
    await expect(confirmDialog).toBeVisible({ timeout: 10000 })
    await confirmDialog.getByRole("button", { name: /^hapus$/i }).first().click()

    await expect(updatedRow).toHaveCount(0, { timeout: 10000 })
    await page.goto("/proyek", { waitUntil: "domcontentloaded" })
    await awaitReady(page, "body")
    await expect(page.locator("body")).not.toContainText(updated)
  })
})

import { test, expect } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"
import { pickDate } from "./utils/pickers"

/**
 * Modul Kalender Kerja.
 *
 * Mengapa spec ini ada sendiri: `crud-surface.spec.ts` menemukan rute secara OTOMATIS
 * dari keberadaan folder `tambah/`. Halaman ini menampilkan tiga seksi (hari libur,
 * hari libur departemen, jadwal kerja) di satu hub dengan form buat di sub-rute
 * masing-masing (`libur/tambah`, dst.), jadi alur tulisnya dibuktikan di sini.
 *
 * Yang diuji bukan sekadar "halaman terbuka": hari libur benar-benar DITAMBAH lewat
 * UI lalu dihapus. Itu jalur tulis yang sebelumnya tidak ada sama sekali —
 * `Holiday`/`DepartmentHoliday`/`WorkSchedule` dulu hanya bisa diisi skrip seed,
 * sehingga aplikasi bisa MENGHAPUS baris yang tidak bisa DIBUAT.
 */
test.describe("SDM — Kalender Kerja", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Kalender Kerja khusus desktop")
  })

  test("tiga seksi tampil, hari libur bisa ditambah lalu dihapus", async ({ page }, testInfo) => {
    const ts = `${Date.now()}-${testInfo.retry}-${testInfo.parallelIndex}`
    const name = `libur-e2e-${ts}`

    await page.goto("/sdm/kalender-kerja", { waitUntil: "domcontentloaded" })
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Something went wrong/i)

    // Ketiga seksi harus benar-benar ter-render (bukan halaman kosong yang "lulus").
    await expect(page.getByRole("heading", { name: "Hari Libur", exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("heading", { name: "Hari Libur Departemen" })).toBeVisible({ timeout: 10_000 })
    await expect(page.getByRole("heading", { name: "Jadwal Kerja", exact: true })).toBeVisible({ timeout: 10_000 })

    // ─── TULIS: tambah hari libur lewat halaman buatnya ─────────────────────
    await page.locator("a[href='/sdm/kalender-kerja/libur/tambah']").click()
    await expect(page.getByRole("heading", { name: "Tambah Hari Libur" })).toBeVisible({ timeout: 30_000 })

    await page.locator("#holidayName").fill(name)
    // Tanggal kini AppDatePicker: pilih 25 Desember 2026 dari kalendernya.
    await pickDate(page, "date", "2026-12-25")
    await page.getByRole("button", { name: "Tambah", exact: true }).click()

    // Kembali ke hub dan barisnya muncul di tabel.
    await page.waitForURL("**/sdm/kalender-kerja", { timeout: 30_000 })
    const row = page.locator("tr", { hasText: name }).first()
    await expect(row).toBeVisible({ timeout: 20_000 })

    // ─── HAPUS: bersihkan data uji supaya spec bisa dijalankan berulang ──────
    await row.getByRole("button", { name: "Hapus" }).click()
    const confirmDialog = page.locator('[role="alertdialog"], [role="dialog"]').filter({ hasText: "Hapus data ini?" }).first()
    await expect(confirmDialog).toBeVisible({ timeout: 10_000 })
    await confirmDialog.getByRole("button", { name: /^hapus$/i }).first().click()
    await expect(page.locator("tr", { hasText: name })).toHaveCount(0, { timeout: 20_000 })
  })
})

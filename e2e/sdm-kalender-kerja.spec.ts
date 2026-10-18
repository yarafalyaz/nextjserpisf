import { test, expect, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"

async function waitForHydration(page: Page) {
  await page.waitForLoadState("networkidle")
  await page.waitForTimeout(2000)
}

/**
 * Modul Kalender Kerja.
 *
 * Mengapa spec ini ada sendiri: `crud-surface.spec.ts` menemukan rute secara OTOMATIS
 * dari keberadaan folder `tambah/`. Halaman ini sengaja memakai form INLINE (tiga
 * form di satu halaman: hari libur, hari libur departemen, jadwal kerja), sehingga
 * tidak punya folder `tambah/` dan TIDAK tercakup spec mana pun — satu-satunya cara
 * membuktikan halaman ini berjalan adalah spec seperti ini.
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
    await waitForHydration(page)

    // ─── TULIS: tambah hari libur ────────────────────────────────────────────
    const holidayForm = page.locator("form").filter({ has: page.locator("#holidayName") }).first()
    await holidayForm.locator("#holidayName").fill(name)
    await holidayForm.locator("#holidayDate").fill("2026-12-25")
    await holidayForm.getByRole("button", { name: "Tambah" }).click()

    // Muncul di tabel tanpa reload manual: aksi server menulis lalu revalidate.
    const row = page.locator("tr", { hasText: name }).first()
    await expect(row).toBeVisible({ timeout: 20_000 })

    // ─── HAPUS: bersihkan data uji supaya spec bisa dijalankan berulang ──────
    await row.getByRole("button", { name: "Hapus" }).click()
    // Dialog konfirmasi memakai label "Hapus" juga — yang terakhir adalah milik dialog.
    await page.getByRole("button", { name: "Hapus" }).last().click()
    await expect(page.locator("tr", { hasText: name })).toHaveCount(0, { timeout: 20_000 })
  })
})

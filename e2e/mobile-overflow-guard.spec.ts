import { test, expect } from "@playwright/test"

/**
 * Guard: halaman kritikal tidak boleh overflow horizontal di viewport HP 390px.
 * Diperkenalkan di ronde 2 mobile friendly audit.
 * Memakai pola documentElement.scrollWidth - clientWidth <= 0
 * yang sama seperti data-table-mobile-cards spec.
 *
 * Halaman yang dicek:
 * - Dashboard root /
 * - Daftar barang (DataTable → card)
 * - Daftar proyek
 * - Daftar tagihan pembelian
 * - Pengaturan log aktivitas (DataTable + filter flex-wrap)
 * - Laporan (catalog tidak overflow, hanya memastikan container tidak escape)
 *
 * Mobile-chrome project menjalankan spec ini (tidak skip).
 * Desktop project juga run sebagai sanity.
 */

const CRITICAL_ROUTES = [
  { path: "/", label: "Dashboard" },
  { path: "/master/barang", label: "Master Barang" },
  { path: "/proyek", label: "Proyek" },
  { path: "/pembelian/tagihan", label: "Tagihan Pembelian" },
  { path: "/pengaturan/log-aktivitas", label: "Log Aktivitas" },
  { path: "/laporan", label: "Laporan Catalog" },
]

test.describe("Mobile overflow guard 390px", () => {
  for (const route of CRITICAL_ROUTES) {
    test(`${route.label} (${route.path}) tidak overflow horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(route.path, { waitUntil: "domcontentloaded" })

      // Tunggu konten utama muncul
      await expect(page.locator("#konten-utama, [data-dashboard-page], main").first()).toBeVisible({ timeout: 20000 })

      // Sedikit delay agar layout settle (sidebar drawer anim, chart render)
      await page.waitForTimeout(500)

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `Overflow di ${route.path}: ${overflow}px melebihi viewport 390`).toBeLessThanOrEqual(1)

      // Tambahan: body juga tidak boleh overflow signifikan
      const bodyOverflow = await page.evaluate(() => document.body.scrollWidth - document.body.clientWidth)
      expect(bodyOverflow, `Body overflow di ${route.path}: ${bodyOverflow}px`).toBeLessThanOrEqual(1)
    })
  }
})

test.describe("Detail pages mobile no overflow", () => {
  // Cek satu halaman detail dengan grid-cols-3 yang sebelumnya pecah
  // Kita tidak hardcode slug dinamis, cek navigasi via list → detail pertama jika ada
  test("Proyek detail tidak overflow (jika ada data)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/proyek", { waitUntil: "domcontentloaded" })
    await page.waitForTimeout(800)

    // Cari link proyek pertama
    const firstProjectLink = page.locator('a[href^="/proyek/"]').first()
    const hasProjects = await firstProjectLink.count() > 0 ? await firstProjectLink.isVisible().catch(() => false) : false

    if (!hasProjects) {
      test.skip(true, "DB ini tidak punya data proyek — detail proyek dilewati, bukan lulus semu")
      return
    }

    await firstProjectLink.click()
    await page.waitForLoadState("domcontentloaded")
    await expect(page.locator("#konten-utama, main").first()).toBeVisible({ timeout: 15000 })
    await page.waitForTimeout(500)

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `Overflow di detail proyek: ${overflow}px`).toBeLessThanOrEqual(1)
  })
})

import { test, expect } from "@playwright/test"

/**
 * Permukaan operasional yang **tidak** terjangkau dua walker dinamis yang ada:
 *
 * - `crud-surface.spec.ts` hanya menelusuri folder yang punya subfolder `tambah/`,
 *   jadi halaman dengan aksi *inline* (tanpa form halaman sendiri) tidak masuk.
 * - `laporan-coverage.spec.ts` hanya menelusuri `laporan/`.
 *
 * Daftar ini SENGAJA eksplisit: halaman-halaman ini adalah alur operasional
 * (menandai transfer, kunci periode, pintasan pribadi, register giro) yang tidak
 * punya "form buat" — sehingga tanpa berkas ini mereka tidak diuji sama sekali,
 * padahal bisa pecah tanpa satu pun unit test gagal.
 */
const OPERATIONAL_ROUTES = [
  "/keuangan/giro",
  "/pembelian/transfer-pemasok",
  "/pengaturan/transaksi-favorit",
  "/pengaturan/proses-akhir-bulan",
]

test.describe("Permukaan operasional tanpa form buat", () => {
  for (const route of OPERATIONAL_ROUTES) {
    test(`renders ${route}`, async ({ page }) => {
      test.setTimeout(60_000)
      const response = await page.goto(route, { waitUntil: "domcontentloaded" })

      // Bukan terlempar ke login, dan bukan halaman error framework.
      await expect(page).not.toHaveURL(/\/login/)
      expect(response?.status() ?? 200, `${route} HTTP status`).toBeLessThan(400)
      await expect(page.locator("body")).not.toContainText(
        /Unhandled Runtime Error|Something went wrong|Terjadi kesalahan|Application error/i,
      )
      // Harus ada judul halaman yang benar-benar dirender.
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 20_000 })
    })
  }
})

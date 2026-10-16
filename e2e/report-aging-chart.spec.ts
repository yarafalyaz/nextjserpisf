import { test, expect } from "@playwright/test"

import { skipOnMobile } from "./utils/desktop-only"

/**
 * Grafik umur piutang & utang.
 *
 * Grafiknya di-load di klien (`ssr: false`) karena recharts berat, jadi spec ini
 * menunggu hidrasi sebelum memeriksa SVG-nya — kalau hanya mengecek teks seksi,
 * grafik yang gagal dirender akan lolos begitu saja.
 */
test.describe("Grafik umur piutang & utang", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Grafik umur hanya diuji di layar lebar")
  })

  for (const [judul, jalur] of [
    ["Grafik Umur Piutang", "/laporan/piutang-jatuh-tempo"],
    ["Grafik Umur Hutang", "/laporan/hutang-jatuh-tempo"],
  ] as const) {
    test(`menampilkan grafik batang di ${jalur}`, async ({ page }) => {
      await page.goto(jalur, { waitUntil: "domcontentloaded" })

      // Judul seksi dirender `ReportSection` (div + heading), BUKAN elemen
      // <section> — memakai locator("section") membuat tes gagal karena
      // elemennya memang tidak ada.
      await expect(page.getByRole("heading", { name: judul })).toBeVisible()

      // recharts menggambar SVG di dalam container ber-role img.
      const grafik = page.getByRole("img", { name: /Grafik umur/ })
      await expect(grafik).toBeVisible({ timeout: 15_000 })
      await expect(grafik.locator(".recharts-surface")).toHaveCount(1, { timeout: 15_000 })

      // Lima kategori umur (AGING_BUCKETS) harus muncul sebagai label sumbu.
      // Batangnya TIDAK dihitung: recharts tidak menggambar batang bernilai nol,
      // jadi di database kosong jumlahnya 0 dan tes akan gagal tanpa alasan.
      await expect(grafik.locator(".recharts-cartesian-axis-tick")).toHaveCount(5, { timeout: 15_000 })
      await expect(grafik).toContainText("Belum Jatuh Tempo")
      await expect(grafik).toContainText("31–60 Hari")
    })
  }
})

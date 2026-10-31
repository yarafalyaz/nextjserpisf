import { test, expect } from "@playwright/test"

/**
 * POSTING FAKTUR PENJUALAN — jalur uang.
 *
 * Mengapa spec ini ada: tidak ada satu pun spec lain yang menekan "Posting faktur
 * ini?" (`sales-flow.spec.ts` hanya memastikan halaman faktur terbuka). Padahal
 * posting fakturlah yang menjalankan `onSalesInvoicePosted`: piutang, pendapatan,
 * HPP, dan pengurangan stok. Selama jalur itu belum pernah dijalankan pada basis
 * data nyata, seluruh rantai uang hanya "terbukti" oleh tes satuan dengan mock.
 *
 * Fixture-nya (`/penjualan/faktur/e2e-post-invoice-draft`) disediakan
 * `scripts/seed-remaining-e2e.ts` blok 11 — faktur bernilai tidak bisa dibuat lewat
 * UI karena form faktur penjualan belum punya baris item.
 */
test.describe("Penjualan — posting faktur", () => {
  test("faktur draft bisa diposting lewat UI dan berubah menjadi Diposting", async ({ page }) => {
    await page.goto("/penjualan/faktur/e2e-post-invoice-draft", { waitUntil: "domcontentloaded" })
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Something went wrong/i)
    await page.waitForLoadState("networkidle")

    // Retry-safe: kalau percobaan sebelumnya sudah memposting faktur ini, tombolnya
    // tidak ada lagi dan yang tersisa justru status "Diposting" — asersinya tetap sah.
    // Hati-hati: status "posted" TANPA pembayaran membayar menampilkan label
    // pembayaran "Belum Bayar", bukan "Diposting" — bukti lulus = tombol Posting
    // hilang (hanya ditawarkan untuk draft) ATAU label status posted tampil.
    const postingButtons = page.getByRole("button", { name: "Posting" })
    if ((await postingButtons.count()) > 0) {
      await postingButtons.first().click()
      // Dialog konfirmasi memakai label yang sama; yang terakhir adalah milik dialog.
      await page.getByRole("button", { name: "Posting" }).last().click()
    }

    // Bukti lulus TEPAT SATU indikator sah terjadwal: label status dokumen
    // ("Diposting" untuk posted, "Dibayar" untuk paid, "Sebagian" untuk
    // partial) — tombol Posting TIDAK PERNAH jadi bukti (ia justru yang
    // ditekan spec ini). Faktur lunas oleh spec lain menampilkan "Dibayar",
    // bukan "Diposting", walau alur posting sudah terbukti.
    await expect(
      page.getByText(/Diposting|Dibayar|Sebagian ditagih|Sebagian/i).first(),
    ).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole("button", { name: "Posting" })).toHaveCount(0, { timeout: 30_000 })
  })
})

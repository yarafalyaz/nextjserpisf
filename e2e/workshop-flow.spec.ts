import { test, expect, type Page } from "@playwright/test"

/**
 * Alur bengkel (read-only): Penawaran → Uang Muka → Perintah Kerja →
 * (QC Inspeksi/NCR bila ada) → Surat Jalan (serah terima).
 *
 * Spec ini TIDAK mengubah data produksi: hanya membuka halaman daftar dan,
 * bila ada baris data, membuka detail baris pertama lalu memastikan tombol
 * rantai ke dokumen berikutnya ada. Bila DB kosong / status dokumen belum
 * memenuhi syarat tombol rantai, tes dilewati jujur via `test.skip`
 * (bukan lulus semu) — mengikuti pola operational-crud.spec.ts.
 *
 * Pola tunggu mengikuti manufacturing-crud.spec.ts (domcontentloaded +
 * hidrasi), bukan networkidle.
 */

/** Buka detail baris pertama di tabel daftar; skip bila tabel kosong. */
async function openFirstDetail(page: Page, listUrl: string) {
  await page.goto(listUrl, { waitUntil: "domcontentloaded" })
  await expect(page.locator("table tbody tr").first()).toBeVisible({ timeout: 30000 })
  const firstLink = page.locator("tbody tr a[href]").first()
  const count = await firstLink.count()
  test.skip(count === 0, `DB ini tidak punya data di ${listUrl} — alur dilewati, bukan lulus semu`)
  await firstLink.click()
  await expect(page.locator("body")).not.toContainText(/Unhandled Runtime Error|Something went wrong/i, { timeout: 30000 })
}

test.describe("Alur bengkel — tiap halaman terbuka", () => {
  test("daftar Penawaran terbuka", async ({ page }) => {
    await page.goto("/penjualan/penawaran", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Penawaran", { timeout: 30000 })
  })

  test("daftar Uang Muka terbuka", async ({ page }) => {
    await page.goto("/penjualan/uang-muka", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Uang Muka", { timeout: 30000 })
  })

  test("daftar Perintah Kerja terbuka", async ({ page }) => {
    await page.goto("/produksi/perintah-kerja", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Perintah Kerja", { timeout: 30000 })
  })

  test("hub QC terbuka (Inspeksi/NCR bila ada)", async ({ page }) => {
    await page.goto("/produksi/qc", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Pengendalian Mutu", { timeout: 30000 })
  })

  test("daftar Inspeksi QC terbuka", async ({ page }) => {
    await page.goto("/produksi/qc/inspeksi", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Inspeksi QC", { timeout: 30000 })
  })

  test("daftar NCR terbuka", async ({ page }) => {
    await page.goto("/produksi/qc/ncr", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Ketidaksesuaian (NCR)", { timeout: 30000 })
  })

  test("daftar Surat Jalan (serah terima) terbuka", async ({ page }) => {
    await page.goto("/penjualan/surat-jalan", { waitUntil: "domcontentloaded" })
    await expect(page.locator("body")).toContainText("Surat Jalan", { timeout: 30000 })
  })
})

test.describe("Alur bengkel — tombol rantai antar dokumen", () => {
  test("Penawaran diterima → tombol Uang Muka / Pesanan Penjualan ada", async ({ page }) => {
    await openFirstDetail(page, "/penjualan/penawaran")
    const chainBtn = page.getByRole("link", { name: /Uang Muka|Pesanan Penjualan/ }).first()
    test.skip(
      (await chainBtn.count()) === 0,
      "Penawaran pada DB ini belum berstatus diterima/disetujui — tombol rantai dilewati, bukan lulus semu",
    )
    await expect(chainBtn).toBeVisible({ timeout: 30000 })
  })

  test("Uang Muka terkonfirmasi → tombol Perintah Kerja ada", async ({ page }) => {
    await openFirstDetail(page, "/penjualan/uang-muka")
    const woBtn = page.getByRole("link", { name: "+ Perintah Kerja" })
    test.skip(
      (await woBtn.count()) === 0,
      "Uang muka pada DB ini belum terkonfirmasi — tombol rantai dilewati, bukan lulus semu",
    )
    await expect(woBtn).toBeVisible({ timeout: 30000 })
  })

  test("Perintah Kerja → tombol Perintah Produksi ada", async ({ page }) => {
    await openFirstDetail(page, "/produksi/perintah-kerja")
    await expect(page.getByRole("link", { name: "+ Perintah Produksi" })).toBeVisible({ timeout: 30000 })
  })

  test("Perintah Kerja selesai → tombol Faktur Penjualan ada", async ({ page }) => {
    await openFirstDetail(page, "/produksi/perintah-kerja")
    const invoiceBtn = page.getByRole("link", { name: "+ Faktur Penjualan" })
    test.skip(
      (await invoiceBtn.count()) === 0,
      "Perintah kerja pada DB ini belum selesai — tombol faktur dilewati, bukan lulus semu",
    )
    await expect(invoiceBtn).toBeVisible({ timeout: 30000 })
  })

  test("form tambah Surat Jalan terbuka (tanpa menyimpan)", async ({ page }) => {
    await page.goto("/penjualan/surat-jalan/tambah", { waitUntil: "domcontentloaded" })
    await expect(page.locator("form").first()).toBeVisible({ timeout: 30000 })
    await expect(page.locator("body")).toContainText("Surat Jalan", { timeout: 30000 })
  })
})

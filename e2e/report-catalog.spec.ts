import { test, expect } from "@playwright/test"

import { skipOnMobile } from "./utils/desktop-only"

/**
 * Katalog `/laporan` — daftar laporan berkategori bergaya Accurate.
 *
 * Sebelumnya halaman ini grid kartu datar: 34 laporan tanpa pengelompokan,
 * tanpa pencarian, dan deskripsinya terpotong. Spec ini menjaga tiga hal yang
 * membuatnya katalog: kategori bisa dipilih, kotak Cari menyaring lintas
 * kategori, dan setiap baris membawa judul + penjelasan utuh.
 */
test.describe("Katalog laporan", () => {
  test.beforeEach(async ({}, testInfo) => {
    skipOnMobile(testInfo.project.name, "Tata letak kategori khusus desktop")
  })

  test("menampilkan kategori dan laporan pada kategori aktif", async ({ page }) => {
    await page.goto("/laporan", { waitUntil: "domcontentloaded" })

    const rail = page.getByRole("navigation", { name: "Kategori laporan" })
    await expect(rail).toBeVisible()
    // 12 kategori: Keuangan, Buku Besar, Kas & Bank, Piutang & Utang, Persediaan,
    // Penjualan, Pembelian, Aset Tetap, Produksi, SDM, Pajak, Pemeriksaan.
    await expect(rail.getByRole("button")).toHaveCount(12)
    await expect(rail.getByRole("button", { name: "SDM" })).toBeVisible()
    await expect(rail.getByRole("button", { name: "Pemeriksaan" })).toBeVisible()

    // Tepat satu kategori bertanda aktif (`aria-current`), supaya pengguna tahu
    // daftar di kanan milik kategori mana.
    await expect(rail.locator('button[aria-current="true"]')).toHaveCount(1)

    // Nama laporan berbentuk "Keluarga (Varian)" seperti Accurate — bukan deretan
    // laporan yang tampak tidak berhubungan.
    const panel = page.locator("section").filter({ has: page.getByRole("search") })
    await expect(panel.getByRole("link", { name: /Laba Rugi \(Standar\)/ })).toBeVisible()
    await expect(panel.getByRole("link", { name: /Laba Rugi \(Per Pusat Biaya\)/ })).toBeVisible()
    await expect(panel.getByRole("link", { name: /Neraca \(Percobaan\)/ })).toBeVisible()
    await expect(panel.getByRole("link", { name: /Arus Kas \(Proyeksi\)/ })).toBeVisible()
    // Laporan tunggal tetap memakai label menunya, tanpa tanda kurung.
    await expect(panel.getByRole("link", { name: /Multi Periode/ })).toBeVisible()

    // Kategori Penjualan → satu laporan, dengan judul + penjelasan bergaya katalog.
    await rail.getByRole("button", { name: /Penjualan/ }).click()
    await expect(panel.getByRole("link", { name: /Analisis Penjualan/ })).toBeVisible()
    await expect(panel.getByText(/^Menampilkan /).first()).toBeVisible()

    // Kategori Produksi → laporan pekerjaan pesanan yang baru ditambahkan.
    await rail.getByRole("button", { name: /Produksi/ }).click()
    await expect(panel.getByRole("link", { name: /Bahan & Biaya Pekerjaan/ })).toBeVisible()
    await expect(panel.getByRole("link", { name: /Penyelesaian Pesanan/ })).toBeVisible()
    await expect(panel.getByRole("link", { name: /Jurnal Pekerjaan Pesanan/ })).toBeVisible()
  })

  test("kotak Cari menyaring lintas kategori, bukan hanya yang aktif", async ({ page }) => {
    await page.goto("/laporan", { waitUntil: "domcontentloaded" })

    // Kategori aktif secara bawaan adalah Keuangan; "piutang" harus tetap
    // menemukan laporan dari Buku Besar dan Piutang & Utang.
    await page.getByRole("search").getByRole("searchbox").fill("piutang")

    const panel = page.locator("section").filter({ has: page.getByRole("search") })
    await expect(panel.getByRole("heading", { name: /Hasil untuk/ })).toBeVisible()
    // Nama laporan memakai gaya "Keluarga (Varian)", jadi hasilnya pun begitu.
    await expect(panel.getByRole("link", { name: /Piutang \(Umur\)/ })).toBeVisible()
    await expect(panel.getByRole("link", { name: /Buku Pembantu \(Piutang\)/ })).toBeVisible()

    // Kata kunci yang tidak ada → empty state, bukan daftar kosong tanpa penjelasan.
    await page.getByRole("search").getByRole("searchbox").fill("zzz-tidak-ada")
    await expect(panel.getByText(/Tidak ada laporan yang cocok/)).toBeVisible()
  })
})

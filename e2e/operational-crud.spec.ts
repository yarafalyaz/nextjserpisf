import { expect, test, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"
import { openCombobox, selectComboboxOptionBySearch, selectFirstComboboxOption } from "./utils/combobox"

/**
 * Memilih opsi lewat pencarian, memilih dengan **keyboard**.
 *
 * Opsi cmdk tidak pernah "stabil" bagi Playwright: hover dari klik memicu re-render
 * (`data-selected` berubah) sehingga klik — termasuk force — bisa meleset. ArrowDown + Enter
 * memilih tanpa klik sama sekali. Pemanggil wajib memverifikasi lewat assertion gagal-cepat.
 */
async function pilihOpsiDenganPencarian(page: Page, placeholder: string, query: string, pola: RegExp): Promise<boolean> {
  const input = await openCombobox(page, { placeholder })
  if (!input) return false
  await input.fill(query)
  const opsi = page.getByRole("option", { name: pola }).first()
  const muncul = await opsi
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false)
  if (!muncul) return false
  await input.press("ArrowDown")
  await input.press("Enter")
  return true
}

/**
 * Alur nyata modul-modul operasional baru — create → verifikasi di daftar → hapus.
 *
 * Spec cakupan lain (`crud-surface`, `laporan-coverage`, `system-smoke`) hanya memastikan
 * halaman *memuat*. Yang belum pernah dibuktikan adalah aksinya benar-benar bekerja lewat
 * sesi login: dokumen tersimpan, muncul di daftar, dan bisa dihapus. Itu yang diperiksa di
 * sini — jadi kalau server action-nya rusak (mis. guard izin salah), tes ini gagal.
 *
 * Modul yang butuh data master (pemasok/barang) memakai `test.skip` bila datanya tidak ada,
 * supaya tetap jujur di DB kosong alih-alih lulus semu.
 */
test.describe("Modul operasional baru — alur create/hapus", () => {
  test("favorit: tambah pintasan lalu hapus", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Baris favorit memakai tombol hapus ala desktop")

    const label = `E2E Favorit ${Date.now()}`

    await page.goto("/pengaturan/transaksi-favorit", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await page.locator("#favorite-label").fill(label)
    await page.locator("#favorite-href").fill("/penjualan/faktur")
    await page.locator("#add-favorite-btn").click()

    // Tersimpan: labelnya muncul di daftar.
    await expect(page.getByText(label).first()).toBeVisible({ timeout: 30_000 })

    // Hapus lewat tombol per baris (tanpa dialog konfirmasi pada komponen ini).
    await page.getByRole("button", { name: `Hapus favorit ${label}` }).click()
    await expect(page.getByText(label)).toHaveCount(0, { timeout: 30_000 })
  })

  test("grup barang: buat lalu hapus", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Aksi baris ada di menu desktop")

    const name = `E2E Grup ${Date.now()}`

    await page.goto("/master/grup-barang/tambah", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    await page.locator("#name").fill(name)
    await page.locator("#submit-item-group").click()

    await page.waitForURL("**/master/grup-barang", { timeout: 30_000 })
    const baris = page.locator("tr").filter({ hasText: name })
    await expect(baris).toBeVisible({ timeout: 30_000 })

    // Hapus: menu aksi → Hapus → konfirmasi dialog (DeleteButton memakai AlertDialog).
    await baris.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click()

    await expect(page.locator("tr").filter({ hasText: name })).toHaveCount(0, { timeout: 30_000 })
  })

  test("harga pemasok: buat lalu hapus", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Form dan aksi baris dirancang untuk layar besar")

    await page.goto("/pembelian/harga-pemasok/tambah", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    const adaPemasok = await selectFirstComboboxOption(page, { placeholder: "Pilih pemasok..." })
    test.skip(!adaPemasok, "DB ini tidak punya data pemasok — alur dilewati, bukan lulus semu")
    const adaBarang = await selectFirstComboboxOption(page, { placeholder: "Pilih barang..." })
    test.skip(!adaBarang, "DB ini tidak punya data barang — alur dilewati, bukan lulus semu")

    // Harga sengaja khas supaya mudah dikenali di daftar (mis. "987.654").
    await page.locator("#price").fill("987654")
    await page.locator("#minQty").fill("1")
    await page.locator("#submit-vendor-price").click()

    await page.waitForURL("**/pembelian/harga-pemasok", { timeout: 30_000 })
    const baris = page.locator("tr").filter({ hasText: "987.654" })
    await expect(baris.first()).toBeVisible({ timeout: 30_000 })

    await baris.first().getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click()

    await expect(page.locator("tr").filter({ hasText: "987.654" })).toHaveCount(0, { timeout: 30_000 })
  })

  test("penyetoran pajak: setor lalu hapus", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Form dan aksi baris dirancang untuk layar besar")

    await page.goto("/keuangan/penyetoran-pajak/tambah", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    await page.locator("#period").fill("2026-09")
    await page.locator("#amount").fill("555222")

    const adaAkun = await selectFirstComboboxOption(page, { name: /Akun Utang Pajak/ })
    test.skip(!adaAkun, "DB ini tidak punya akun utang pajak — alur dilewati, bukan lulus semu")
    const adaBank = await selectFirstComboboxOption(page, { name: /Dibayar dari Kas\/Bank/ })
    test.skip(!adaBank, "DB ini tidak punya akun kas/bank — alur dilewati, bukan lulus semu")

    await page.locator("#submit-tax-payment").click()

    await page.waitForURL("**/keuangan/penyetoran-pajak", { timeout: 30_000 })
    const baris = page.locator("tr").filter({ hasText: "555.222" })
    await expect(baris.first()).toBeVisible({ timeout: 30_000 })

    await baris.first().getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click()

    await expect(page.locator("tr").filter({ hasText: "555.222" })).toHaveCount(0, { timeout: 30_000 })
  })

  test("uang muka pembelian: catat lalu hapus", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Form dan aksi baris dirancang untuk layar besar")

    await page.goto("/pembelian/uang-muka/tambah", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    await page.locator("#amount").fill("444333")

    const adaPemasok = await selectFirstComboboxOption(page, { name: /Pemasok/ })
    test.skip(!adaPemasok, "DB ini tidak punya data pemasok — alur dilewati, bukan lulus semu")

    // Akun uang muka TIDAK diubah: halaman sudah memilih default-nya sendiri (akun aset
    // yang namanya cocok /uang muka/i). Sempat saya ganti, dan itu justru membuat akun
    // uang muka == akun kas/bank sehingga aksinya benar menolak.
    await expect(page.locator("#advanceAccountId")).not.toContainText("Mis.")

    const adaBank = await selectFirstComboboxOption(page, { name: /Dibayar dari Kas\/Bank/ })
    test.skip(!adaBank, "DB ini tidak punya akun kas/bank — alur dilewati")

    // Gagal-cepat dengan pesan jelas, bukan timeout 30 detik yang membingungkan.
    await expect(page.locator("#paymentAccountId")).not.toContainText("Pilih rekening kas/bank")

    await page.locator("#submit-purchase-advance").click()

    await page.waitForURL("**/pembelian/uang-muka", { timeout: 30_000 })
    const baris = page.locator("tr").filter({ hasText: "444.333" })
    await expect(baris.first()).toBeVisible({ timeout: 30_000 })

    await baris.first().getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click()

    await expect(page.locator("tr").filter({ hasText: "444.333" })).toHaveCount(0, { timeout: 30_000 })
  })

  test("giro: catat lalu tandai cair lalu hapus", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Form dan aksi baris dirancang untuk layar besar")

    const nomor = `E2E-CHQ-${Date.now()}`

    await page.goto("/keuangan/giro", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    // Rekening bersifat opsional di aksinya, jadi alur ini tidak bergantung data master.
    await page.locator("#cheque-number").fill(nomor)
    await page.locator("#cheque-party").fill("E2E Pihak")
    await page.locator("#cheque-amount").fill("333222")
    await page.locator("#create-cheque-btn").click()

    const baris = page.locator("tr").filter({ hasText: nomor })
    await expect(baris).toBeVisible({ timeout: 30_000 })
    await expect(baris).toContainText("Belum Cair")

    // Ubah status: tombol per baris memakai aria-label yang memuat nomor dokumen.
    await baris.getByRole("button", { name: /Tandai cair/ }).click()
    await expect(page.locator("tr").filter({ hasText: nomor })).toContainText("Sudah Cair", {
      timeout: 30_000,
    })

    await page
      .locator("tr")
      .filter({ hasText: nomor })
      .getByRole("button", { name: /^Hapus/ })
      .click()
    await expect(page.locator("tr").filter({ hasText: nomor })).toHaveCount(0, { timeout: 30_000 })
  })

  test("transfer pemasok: tandai sudah ditransfer lalu batalkan", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Panel instruksi transfer dirancang untuk layar besar")

    // Pembayaran vendor dari seed (nominal 180.000, tanggal Mei 2026, status draft).
    await page.goto("/pembelian/transfer-pemasok?periode=2026-05", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    const baris = page.locator("label").filter({ hasText: "180.000" }).first()
    await expect(baris).toBeVisible({ timeout: 30_000 })
    // Status pembayaran terlihat pada baris ini; spec konfirmasi bisa mengubahnya lebih dulu
    // (berjalan paralel), jadi jangan dikunci ke "draft".
    await expect(baris).toContainText(/Konsep|Selesai/)

    await baris.getByRole("checkbox").check()
    await page.locator("#mark-transferred").click()
    await expect(page.getByText("Sudah ditransfer (1)")).toBeVisible({ timeout: 30_000 })

    // Batalkan lagi supaya DB tidak ditinggalkan dalam keadaan tertandai.
    await page.locator("label").filter({ hasText: "180.000" }).first().getByRole("checkbox").check()
    await page.locator("#unmark-transferred").click()
    await expect(page.getByText("Sudah ditransfer (0)")).toBeVisible({ timeout: 30_000 })
  })

  test("transfer antar rekening: catat lalu hapus (jurnal ikut diposting)", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Form dan kolom aksi dirancang untuk layar besar")

    await page.goto("/keuangan/transfer-bank/tambah", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    await page.locator("#amount").fill("777888")

    // Rekening asal dan tujuan wajib berbeda (aksi menolak bila sama).
    const dari = await pilihOpsiDenganPencarian(page, "Pilih rekening asal...", "Kas Kecil", /Kas Kecil/i)
    test.skip(!dari, "DB ini tidak punya akun kas kecil — alur dilewati")
    const ke = await pilihOpsiDenganPencarian(page, "Pilih rekening tujuan...", "Deposito", /Deposito/i)
    test.skip(!ke, "DB ini tidak punya akun bank tujuan — alur dilewati")
    // Gagal-cepat kalau pemilihan tidak benar-benar tersimpan.
    await expect(page.locator("#fromAccountId")).not.toContainText("Pilih rekening asal")
    await expect(page.locator("#toAccountId")).not.toContainText("Pilih rekening tujuan")

    await page.locator("#submit-bank-transfer").click()
    await page.waitForURL("**/keuangan/transfer-bank", { timeout: 30_000 })

    const baris = page.locator("tr").filter({ hasText: "777.888" }).first()
    await expect(baris).toBeVisible({ timeout: 30_000 })

    await baris.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click()
    await expect(page.locator("tr").filter({ hasText: "777.888" })).toHaveCount(0, { timeout: 30_000 })
  })

  test("tukar faktur: serahkan faktur belum lunas lalu hapus", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Form dan kolom aksi dirancang untuk layar besar")

    await page.goto("/penjualan/tukar-faktur/tambah", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    // Pelanggan seed ("E2E Customer") punya satu faktur belum lunas senilai 125.000.
    // Faktur bernilai tak bisa dibuat lewat UI: form faktur penjualan belum punya baris item.
    const adaPelanggan = await selectComboboxOptionBySearch(
      page,
      { name: /Pelanggan/ },
      "E2E Customer",
      /E2E Customer/i,
    )
    test.skip(!adaPelanggan, "DB ini tidak punya pelanggan seed — alur dilewati")

    const faktur = page.locator("label").filter({ hasText: "125.000" }).first()
    await expect(faktur).toBeVisible({ timeout: 30_000 })
    await faktur.getByRole("checkbox").check()

    const tandaTerima = `TT-E2E-${Date.now()}`
    await page.locator("#receiptNumber").fill(tandaTerima)
    await page.locator("#submit-invoice-exchange").click()

    // Register menampilkan kolom Tanda Terima → barisnya dikenali dari nomor unik ini.
    await page.waitForURL("**/penjualan/tukar-faktur", { timeout: 30_000 })
    const baris = page.locator("tr").filter({ hasText: tandaTerima })
    await expect(baris).toBeVisible({ timeout: 30_000 })
    await expect(baris).toContainText("125.000")

    await baris.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click()
    await expect(page.locator("tr").filter({ hasText: tandaTerima })).toHaveCount(0, { timeout: 30_000 })
  })

  test("pembayaran vendor: posting tagihan lalu konfirmasi pembayaran", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Menu aksi dirancang untuk layar besar")
    const MENU = "Buka menu aksi"

    // 1. Posting tagihan vendor (seed: draft, 180.000). Tanpa ini vendor belum punya utang
    //    terbuka, dan konfirmasi pembayaran memang ditolak ("melebihi total tagihan terutang").
    await page.goto("/pembelian/tagihan", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    const barisTagihan = page.locator("tr").filter({ hasText: "180.000" }).first()
    await expect(barisTagihan).toBeVisible({ timeout: 30_000 })
    if (((await barisTagihan.textContent()) ?? "").includes("Konsep")) {
      await barisTagihan.getByRole("button", { name: MENU }).click()
      await page.getByRole("menuitem", { name: "Posting" }).click()
      await page.getByRole("alertdialog").getByRole("button", { name: "Posting" }).click()
      await expect(page.locator("tr").filter({ hasText: "180.000" }).first()).toContainText(
        "Diposting",
        { timeout: 30_000 },
      )
    }

    // 2. Konfirmasi pembayaran draft → jurnal diposting + dialokasikan ke tagihan terbuka.
    await page.goto("/pembelian/pembayaran-vendor", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    const barisBayar = page.locator("tr").filter({ hasText: "180.000" }).first()
    await expect(barisBayar).toBeVisible({ timeout: 30_000 })
    // Konfirmasi bersifat permanen: pada run ulang di DB yang sama, lewati (jangan gagal).
    test.skip(
      !((await barisBayar.textContent()) ?? "").includes("Konsep"),
      "pembayaran seed sudah dikonfirmasi di DB ini",
    )

    await barisBayar.getByRole("button", { name: MENU }).click()
    await page.getByRole("menuitem", { name: "Konfirmasi & Posting" }).click()
    // confirmLabel = processLabel, jadi tombol dialog bernama sama — dibatasi ke dialog.
    await page.getByRole("alertdialog").getByRole("button", { name: "Konfirmasi & Posting" }).click()
    await expect(page.locator("tr").filter({ hasText: "180.000" }).first()).toContainText("Selesai", {
      timeout: 30_000,
    })
  })

  test("jurnal manual: posting lewat UI sehingga masuk pembukuan", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Menu aksi dirancang untuk layar besar")

    // Seed menyediakan satu jurnal DRAFT; yang lain sudah POSTED ("Diposting").
    await page.goto("/keuangan/jurnal", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    // Ditemukan lewat deskripsinya (bukan hitungan baris): spec lain bisa membuat jurnal
    // draft bersamaan, sehingga "tepat satu baris draft" tidak boleh diasumsikan.
    const barisDraft = page.locator("tbody tr").filter({ hasText: "E2E jurnal manual menunggu posting" }).first()
    await expect(barisDraft).toBeVisible({ timeout: 30_000 })
    await expect(barisDraft).toContainText("Konsep")

    await barisDraft.getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: "Posting" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Posting" }).click()

    // Baris yang sama kini berstatus terposting → jurnalnya masuk pembukuan.
    await expect(
      page.locator("tbody tr").filter({ hasText: "E2E jurnal manual menunggu posting" }).first(),
    ).toContainText("Diposting", { timeout: 30_000 })
  })

  test("proses akhir bulan: kunci lalu buka kembali", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Panel tutup buku dirancang untuk layar besar")

    // Kedua aksi memakai window.confirm — terima supaya aksinya benar-benar dijalankan.
    page.on("dialog", (dialog) => dialog.accept())

    await page.goto("/pengaturan/proses-akhir-bulan", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    const tombolKunci = page.getByRole("button", { name: /^Kunci sampai/ })
    await expect(tombolKunci).toBeEnabled({ timeout: 30_000 })
    await tombolKunci.click()

    // Terkunci: panel menyebut tanggal kunci yang berlaku.
    await expect(page.getByText(/Kunci periode berlaku sampai/)).toBeVisible({ timeout: 30_000 })

    // Dan bisa dibuka lagi — supaya tes ini tidak meninggalkan DB dalam keadaan terkunci
    // (periode yang dikunci bisa menghalangi spec lain yang membuat dokumen bertanggal).
    await page.getByRole("button", { name: "Buka kunci periode" }).click()
    await expect(page.getByText("Periode belum pernah dikunci.")).toBeVisible({ timeout: 30_000 })
  })
})

// ─── Gerbang & status dokumen ────────────────────────────────────────────────
// Tes-tes di bawah berada DI LUAR describe di atas karena menguji satu hal lintas
// modul, bukan alur satu modul: (a) halaman gerbang menjelaskan syarat statusnya
// alih-alih menyajikan pemilih kosong, dan (b) tombol Setujui (rute status generik
// /api/workflow) benar-benar menaikkan status dokumen. Tes (b) mengabadikan koreksi
// atas klaim "gerbang buntu" yang dulu saya buat berdasarkan pembacaan kode.

test("penerimaan: menjelaskan sebab bila tak ada PO layak (bukan buntu senyap)", async ({ page }, testInfo) => {
  skipOnMobile(testInfo.project.name, "Halaman form diuji di layar besar")

  await page.goto("/pembelian/penerimaan/tambah", { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle")

  // Kalau DB ini punya PO layak, halaman menampilkan form — bukan pesan.
  const adaForm = await page.locator("form").count()
  test.skip(adaForm > 0, "DB ini punya PO berstatus layak; halaman menampilkan form")

  await expect(page.getByText(/Belum ada PO yang bisa diterima/i)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/konfigurasi alur persetujuan/i)).toBeVisible()
})

test("status dokumen: Setujui menaikkan status SO, dan gerbang surat jalan menerimanya", async ({ page }, testInfo) => {
  skipOnMobile(testInfo.project.name, "Tombol status & form dirancang untuk layar besar")

  // Tes ini mengabadikan KOREKSI atas klaim lama saya ("gerbang buntu"): rute status generik
  // /api/workflow punya jalur fall-through yang, tanpa workflow terkonfigurasi, menaikkan
  // dokumen menjadi `approved`. Tanpa tes ini, kekeliruan itu bisa terulang.
  await page.goto("/penjualan/pesanan", { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle")
  // Hati-hati: `a[href^="/penjualan/pesanan/"]` juga cocok dengan tautan "/tambah";
  // ambil tautan di dalam baris tabel (detail), bukan tombol tambah di header.
  const tautan = page.locator('tbody a[href^="/penjualan/pesanan/"]').first()
  await expect(tautan).toBeVisible({ timeout: 30_000 })
  const href = await tautan.getAttribute("href")
  await page.goto(href as string, { waitUntil: "domcontentloaded" })

  // Halaman detail mengalirkan komponen klien (StatusActions) — jadi JANGAN memutuskan skip
  // dari `count()` seketika: tunggu tombolnya benar-benar muncul. (Pelajaran yang sama seperti
  // hitungan <h1> dan tautan gerbang di tes ini.)
  const setujui = page.getByRole("button", { name: "Setujui" })
  const adaTombol = await setujui
    .first()
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false)
  test.skip(!adaTombol, "SO pada DB ini sudah tidak berstatus draft")

  await setujui.first().click()
  // Tombolnya hilang setelah disetujui (StatusActions hanya menawarkannya untuk draft/pending)
  // — asersi tak bergantung label status.
  await expect(page.getByRole("button", { name: "Setujui" })).toHaveCount(0, { timeout: 30_000 })

  // Konsekuensinya: gerbang surat jalan MENERIMA SO itu — jadi ia memang tidak buntu.
  await page.goto("/penjualan/surat-jalan/tambah", { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle")
  await expect(page.getByText(/Belum ada pesanan penjualan yang bisa dikirim/i)).toHaveCount(0)
})

test("gerbang dokumen: form tetap tampil, dan sebabnya dijelaskan bila kosong", async ({ page }, testInfo) => {
  skipOnMobile(testInfo.project.name, "Halaman form diuji di layar besar")

  const halaman = [
    "/pembelian/penerimaan/tambah",
    "/penjualan/surat-jalan/tambah",
    "/penjualan/uang-muka/tambah",
  ] as const
  for (const url of halaman) {
    await page.goto(url, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")
    // crud-surface mewajibkan surface yang bisa diisi — form harus tetap tampil.
    await expect(page.locator("form").first()).toBeVisible({ timeout: 15_000 })
  }

  // Di DB ber-seed: tak ada PO dan tak ada penawaran → sebabnya harus dijelaskan.
  // `.first()` + tunggu tenang: saat hidrasi, pohon sempat berisi dua salinan sehingga
  // locator teks bisa kena strict-mode violation (artefak, bukan duplikat nyata).
  await page.goto("/pembelian/penerimaan/tambah", { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle")
  await expect(page.getByText(/Belum ada PO yang bisa diterima/i).first()).toBeVisible({ timeout: 15_000 })
  await page.goto("/penjualan/uang-muka/tambah", { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle")
  await expect(page.getByText(/Belum ada penawaran yang bisa dipakai/i).first()).toBeVisible({ timeout: 15_000 })
})

import { expect, test, type Page } from "@playwright/test"
import { skipOnMobile } from "./utils/desktop-only"
import { openCombobox, selectComboboxOptionBySearch, selectFirstComboboxOption } from "./utils/combobox"
import { pickMonth } from "./utils/pickers"
import { prisma } from "@/lib/db/prisma"

/**
 * Nominal format id-ID yang tampil di daftar (555222 → "555.222"). Nominal
 * dipilih pseudo-acak per run supaya baris test ini tak pernah tertukar
 * dengan sisa run lain di DB bersama.
 */
function fmtAmount(n: number): string {
  return n.toLocaleString("id-ID")
}

function uniqueAmount(base: number): number {
  return base + (Date.now() % 900)
}

/**
 * Hapus/void lewat menu aksi baris ini persis. Aksi void finansial kini
 * menolak alasan kosong (guard server) — dialog wajib diisi alasannya dulu;
 * tanpa alasan, klik Hapus hanya memunculkan toast galat dan dialog tetap
 * terbuka (perilaku produk yang benar, ditegaskan di sini, bukan dilewati).
 */
async function deleteRowWithReason(page: Page, rowText: string): Promise<void> {
  const row = page.locator("tr").filter({ hasText: rowText }).first()
  await expect(row).toBeVisible({ timeout: 30_000 })
  await row.getByRole("button", { name: "Buka menu aksi" }).click()
  await page.getByRole("menuitem", { name: "Hapus" }).click()
  const dialog = page.getByRole("alertdialog")
  // ReasonField memakai <label htmlFor> + Textarea tanpa htmlFor dari label
  // shadcn, jadi getByLabel bisa meleset — isi lewat placeholder stabilnya.
  // Dialog harus BENAR-BENAR tertutup sesudahnya; bila alasan kosong, guard
  // klien menolak dan dialog tetap terbuka — gagal cepat di sini, bukan
  // timeout 30 dtk di oracle reload yang membingungkan.
  await dialog.getByPlaceholder("Tulis alasan pembatalan (wajib diisi)").fill("E2E hapus record uji")
  await dialog.getByRole("button", { name: "Hapus" }).click()
  await expect(dialog, "dialog hapus tidak tertutup — alasan/aksi void gagal").toBeHidden({ timeout: 10_000 })
}

/**
 * Oracle hapus yang jujur di DB bersama: segarkan daftar lewat navigasi ulang
 * (RSC segar dari server), lalu tegaskan TIDAK ADA baris desktop yang memuat
 * teks ini. Menghitung `tr` mentah menghitung juga kartu mobile DataTable
 * (baris tampil dua kali di DOM) dan payload basi pra-refresh.
 */
async function expectRowGoneAfterReload(page: Page, listUrl: string, rowText: string): Promise<void> {
  await page.goto(listUrl, { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle")
  await expect(
    page.locator("div.hidden.md\\:block tr").filter({ hasText: rowText }),
  ).toHaveCount(0, { timeout: 30_000 })
}

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
    const baris = page.locator("tr").filter({ hasText: name }).first()
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
    const baris = page.locator("tr").filter({ hasText: "987.654" }).first()
    await expect(baris.first()).toBeVisible({ timeout: 30_000 })

    await baris.first().getByRole("button", { name: "Buka menu aksi" }).click()
    await page.getByRole("menuitem", { name: "Hapus" }).click()
    await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click()

    await expect(page.locator("tr").filter({ hasText: "987.654" })).toHaveCount(0, { timeout: 30_000 })
  })

  test("penyetoran pajak: setor lalu hapus", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Form dan aksi baris dirancang untuk layar besar")

    const amount = uniqueAmount(555_000)
    const label = fmtAmount(amount)

    await page.goto("/keuangan/penyetoran-pajak/tambah", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    // Masa pajak kini AppMonthPicker (bukan <input type=month>): pilih dari grid.
    await pickMonth(page, "period", "Sep")
    await page.locator("#amount").fill(String(amount))

    const adaAkun = await selectFirstComboboxOption(page, { name: /Akun Utang Pajak/ })
    test.skip(!adaAkun, "DB ini tidak punya akun utang pajak — alur dilewati, bukan lulus semu")
    const adaBank = await selectFirstComboboxOption(page, { name: /Dibayar dari Kas\/Bank/ })
    test.skip(!adaBank, "DB ini tidak punya akun kas/bank — alur dilewati, bukan lulus semu")

    await page.locator("#submit-tax-payment").click()

    await page.waitForURL("**/keuangan/penyetoran-pajak", { timeout: 30_000 })
    const baris = page.locator("tr").filter({ hasText: label }).first()
    await expect(baris).toBeVisible({ timeout: 30_000 })

    await deleteRowWithReason(page, label)
    await expectRowGoneAfterReload(page, "/keuangan/penyetoran-pajak", label)
    const gone = await prisma.taxPayment.findFirst({
      where: { amount, deletedAt: null },
      select: { id: true },
    })
    expect(gone).toBeNull()
  })

  test("uang muka pembelian: catat lalu hapus", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Form dan aksi baris dirancang untuk layar besar")

    const amount = uniqueAmount(444_000)
    const label = fmtAmount(amount)

    await page.goto("/pembelian/uang-muka/tambah", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    await page.locator("#amount").fill(String(amount))

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
    const baris = page.locator("tr").filter({ hasText: label }).first()
    await expect(baris).toBeVisible({ timeout: 30_000 })

    await deleteRowWithReason(page, label)
    await expectRowGoneAfterReload(page, "/pembelian/uang-muka", label)
    const gone = await prisma.purchaseAdvance.findFirst({
      where: { amount, deletedAt: null },
      select: { id: true },
    })
    expect(gone).toBeNull()
  })

  test("giro: catat lalu tandai cair lalu hapus", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Form dan aksi baris dirancang untuk layar besar")

    const nomor = `E2E-CHQ-${Date.now()}`
    const amount = uniqueAmount(333_000)

    await page.goto("/keuangan/giro", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    // Rekening bersifat opsional di aksinya, jadi alur ini tidak bergantung data master.
    await page.locator("#cheque-number").fill(nomor)
    await page.locator("#cheque-party").fill("E2E Pihak")
    await page.locator("#cheque-amount").fill(String(amount))
    await page.locator("#create-cheque-btn").click()

    // Daftar giro dirender klien dari props SSR sesudah router.refresh() —
    // baris baru lahir dengan status pending ("Belum Cair" di sel Status).
    // Scope ke tabel manajer `Daftar Giro & Cek`: halaman yang sama juga
    // merender seksi antrean lewat tempo berisi <tr> lain dengan jumlah sel
    // berbeda — `tr`.first() di halaman menangkap baris antrean itu dan
    // indeks sel Status-nya bergeser (nth(8) = sel Nominal antrean).
    const tblManajer = page.locator('table[data-report-table="Daftar Giro & Cek"]')
    const baris = tblManajer.locator("tr").filter({ hasText: nomor }).first()
    await expect(baris).toBeVisible({ timeout: 30_000 })
    // Kolom Status = sel ke-9 (Jatuh Tempo, No. Dokumen, Nomor, Jenis, Arah,
    // Pihak, Rekening, Nominal, Status, Aksi).
    await expect(baris.locator("td").nth(8)).toContainText("Belum Cair", { timeout: 30_000 })

    // Ubah status: tombol per baris memakai aria-label yang memuat nomor dokumen.
    await baris.getByRole("button", { name: /Tandai cair/ }).click()
    await expect(
      tblManajer.locator("tr").filter({ hasText: nomor }).locator("td").nth(8),
    ).toContainText("Sudah Cair", { timeout: 30_000 })

    // Hapus tombol per baris (tanpa dialog pada komponen ini; label memuat nomor).
    await tblManajer
      .locator("tr")
      .filter({ hasText: nomor })
      .getByRole("button", { name: /^Hapus/ })
      .click()
    // Daftar klien: tunggu refresh sesudah hapus — baris hilang dari DOM tabel.
    await expect(tblManajer.locator("tr").filter({ hasText: nomor })).toHaveCount(0, { timeout: 30_000 })
    const gone = await prisma.cheque.findFirst({
      where: { number: nomor, deletedAt: null },
      select: { id: true },
    })
    expect(gone).toBeNull()
  })

  test("transfer pemasok: tandai sudah ditransfer lalu batalkan", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Panel instruksi transfer dirancang untuk layar besar")

    // Target = pembayaran vendor 180.000 Mei 2026 yang BELUM ditransfer, diambil
    // dari DB — bukan label nominal pertama di halaman. Seed membuat beberapa
    // pembayaran 180.000 di periode yang sama; memilih yang pertama menandai/
    // membatalkan baris yang salah dan memalsukan hitungan panel.
    const target = await prisma.vendorPayment.findFirst({
      where: {
        amount: 180000,
        transferredAt: null,
        deletedAt: null,
        paymentDate: { gte: new Date("2026-05-01"), lt: new Date("2026-06-01") },
      },
      orderBy: { id: "asc" },
      select: { id: true, documentNo: true },
    })
    expect(target, "fixture pembayaran vendor Mei 2026 belum-ditransfer tidak ada").not.toBeNull()
    if (!target) return

    await page.goto("/pembelian/transfer-pemasok/bulan/2026-05", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    const row = page.locator("label").filter({ hasText: target.documentNo }).first()
    await expect(row).toBeVisible({ timeout: 30_000 })

    const transferredBefore = await prisma.vendorPayment.count({
      where: {
        transferredAt: { not: null },
        deletedAt: null,
        paymentDate: { gte: new Date("2026-05-01"), lt: new Date("2026-06-01") },
      },
    })

    await row.getByRole("checkbox").check()
    await page.locator("#mark-transferred").click()
    // Panel memperbarui hitungan seksi sesudah refresh; target pindah seksi.
    await expect(
      page.getByText(`Sudah ditransfer (${transferredBefore + 1})`),
    ).toBeVisible({ timeout: 30_000 })
    let marked = await prisma.vendorPayment.findUniqueOrThrow({ where: { id: target.id } })
    for (let i = 0; i < 20 && !marked.transferredAt; i++) {
      await page.waitForTimeout(500)
      marked = await prisma.vendorPayment.findUniqueOrThrow({ where: { id: target.id } })
    }
    expect(marked.transferredAt).not.toBeNull()

    // Batalkan lagi supaya DB tidak ditinggalkan dalam keadaan tertandai.
    const markedRow = page.locator("label").filter({ hasText: target.documentNo }).first()
    await markedRow.getByRole("checkbox").check()
    await page.locator("#unmark-transferred").click()
    await expect(
      page.getByText(`Sudah ditransfer (${transferredBefore})`),
    ).toBeVisible({ timeout: 30_000 })
    let unmarked = await prisma.vendorPayment.findUniqueOrThrow({ where: { id: target.id } })
    for (let i = 0; i < 20 && unmarked.transferredAt; i++) {
      await page.waitForTimeout(500)
      unmarked = await prisma.vendorPayment.findUniqueOrThrow({ where: { id: target.id } })
    }
    expect(unmarked.transferredAt).toBeNull()
  })

  test("transfer antar rekening: catat lalu hapus (jurnal ikut diposting)", async ({ page }, testInfo) => {
    skipOnMobile(testInfo.project.name, "Form dan kolom aksi dirancang untuk layar besar")

    const amount = uniqueAmount(777_000)
    const label = fmtAmount(amount)

    await page.goto("/keuangan/transfer-bank/tambah", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    await page.locator("#amount").fill(String(amount))

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

    const baris = page.locator("tr").filter({ hasText: label }).first()
    await expect(baris).toBeVisible({ timeout: 30_000 })

    await deleteRowWithReason(page, label)
    await expectRowGoneAfterReload(page, "/keuangan/transfer-bank", label)
    const gone = await prisma.bankTransfer.findFirst({
      where: { amount, deletedAt: null },
      select: { id: true },
    })
    expect(gone).toBeNull()
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
    const baris = page.locator("tr").filter({ hasText: tandaTerima }).first().first()
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

    // Fixture jurnal draft dipilih dari DB dan DIPASTIKAN masih DRAFT oleh
    // spec ini sendiri (reset di awal, pola sales-chain): jurnal draft
    // berdeskripsi sama bisa sudah terposting oleh run/batch lain yang
    // berjalan paralel di DB yang sama, dan memilih baris pertama berteks
    // deskripsi menangkap yang sudah "Diposting".
    const fixture = await prisma.journal.findFirst({
      where: { description: { contains: "E2E jurnal manual menunggu posting" } },
      orderBy: { id: "desc" },
      select: { id: true, journalNumber: true, status: true },
    })
    if (!fixture || !fixture.journalNumber) {
      throw new Error("fixture jurnal 'E2E jurnal manual menunggu posting' tidak ada — jalankan reseed scratch")
    }
    if (fixture.status !== "DRAFT") {
      await prisma.journal.update({
        where: { id: fixture.id },
        data: { status: "DRAFT" },
      })
    }
    // Daftar jurnal terpaginasi; filter server lewat ?cari= supaya baris
    // fixture terpilih tepat (bukan halaman pertama daftar).
    await page.goto(`/keuangan/jurnal?cari=${encodeURIComponent(fixture.journalNumber)}`, { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    const barisDraft = page.locator("tbody tr").filter({ hasText: fixture.journalNumber }).first()
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

    await page.goto("/pengaturan/proses-akhir-bulan", { waitUntil: "domcontentloaded" })
    await page.waitForLoadState("networkidle")

    const tombolKunci = page.getByRole("button", { name: /^Kunci sampai/ })
    await expect(tombolKunci).toBeEnabled({ timeout: 30_000 })
    await tombolKunci.click()

    // Dialog konfirmasi standar aplikasi (ConfirmDialog), bukan window.confirm.
    const dialogKunci = page.getByRole("alertdialog")
    await expect(dialogKunci.getByText(/Kunci periode sampai/)).toBeVisible({ timeout: 10_000 })
    await dialogKunci.getByRole("button", { name: "Kunci periode" }).click()

    // Terkunci: panel menyebut tanggal kunci yang berlaku.
    await expect(page.getByText(/Kunci periode berlaku sampai/)).toBeVisible({ timeout: 30_000 })

    // Dan bisa dibuka lagi — supaya tes ini tidak meninggalkan DB dalam keadaan terkunci
    // (periode yang dikunci bisa menghalangi spec lain yang membuat dokumen bertanggal).
    await page.getByRole("button", { name: "Buka kunci periode" }).click()
    const dialogBuka = page.getByRole("alertdialog")
    await expect(dialogBuka.getByText(/Buka kunci periode/)).toBeVisible({ timeout: 10_000 })
    await dialogBuka.getByRole("button", { name: "Buka kunci" }).click()
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
  // Target SO dipilih dari DB: draft dengan sisa kirim > 0 (baris yang sudah
  // terikat surat jalan non-batal menghabiskan sisa — `buildDeliveryOrderLines`
  // membuang baris ber-sisa 0, jadi SO seperti itu tak membuktikan gerbang).
  // Setiap SO seed scratch sudah terikat DO draft penuh → tak ada target → skip
  // SAH di DB ini; di DB tanpa DO menempel, target tersedia dan asersi penuh jalan.
  const candidates = await prisma.salesOrder.findMany({
    where: { status: "draft", deletedAt: null },
    orderBy: { id: "asc" },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      items: { select: { id: true, qty: true, itemId: true } },
      deliveryOrders: {
        where: { status: { notIn: ["cancelled", "void"] } },
        select: { items: { select: { salesOrderItemId: true, qty: true } } },
      },
    },
  })
  const targetSO = candidates.find((so) => {
    const shipped = new Map<number, number>()
    for (const d of so.deliveryOrders) {
      for (const it of d.items) {
        if (it.salesOrderItemId == null) continue
        shipped.set(it.salesOrderItemId, (shipped.get(it.salesOrderItemId) ?? 0) + Number(it.qty))
      }
    }
    return so.items.some((li) => li.itemId != null && Number(li.qty) - (shipped.get(li.id) ?? 0) > 0)
  })
  test.skip(!targetSO, "tidak ada SO draft dengan sisa kirim di DB ini")
  if (!targetSO) return

  // Navigasi ke detail SO target persis (bukan baris pertama daftar).
  await page.goto(`/penjualan/pesanan/${targetSO.slug ?? targetSO.id}`, { waitUntil: "domcontentloaded" })

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

  // Shard paralel: tes lain bisa membuat PO/penawaran layak di DB bersama.
  // Bila halaman menampilkan opsi (ada data layak), pesan kosong memang TAK
  // tampil — skip bagian itu (pola sama dengan tes "menjelaskan sebab" di atas).
  await page.goto("/pembelian/penerimaan/tambah", { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle")
  // R10-01: expect().toBeVisible MENUNGGU (bukan isVisible instan yang tak
  // menunggu). Timeout pendek 3 dtk: bila pesan tak muncul, WAJIB ada bukti
  // data layak (opsi PO di combobox) baru boleh skip; tanpa bukti = fail.
  const pesanPO = page.getByText(/Belum ada PO yang bisa diterima/i).first()
  const poKosong = await expect(pesanPO).toBeVisible({ timeout: 3_000 }).then(
    () => true,
    () => false,
  )
  if (!poKosong) {
    // R10-01(2): bukti TERIKAT combobox PO spesifik — buka dropdown
    // "Cari pesanan pembelian..." lalu hitung [role=option] di listbox-nya.
    // Bukan 'ul li' global (nav/daftar lain bisa false-positive).
    let buktiPO = 0
    try {
      // Jangkar: button#purchaseOrderId (id stabil, tanpa ubah UI).
      await page.locator('button#purchaseOrderId[role="combobox"]').click({ timeout: 3_000 })
      buktiPO = await page.locator('[role="listbox"] [role="option"]').count()
    } catch {
      buktiPO = 0
    }
    test.skip(buktiPO > 0, "Shard paralel membuat PO layak; halaman menampilkan form")
    // Tanpa bukti = kondisi aneh (bukan pesan, bukan opsi) → fail jujur.
    await expect(pesanPO).toBeVisible({ timeout: 15_000 })
  }
  await page.goto("/penjualan/uang-muka/tambah", { waitUntil: "domcontentloaded" })
  await page.waitForLoadState("networkidle")
  const pesanQ = page.getByText(/Belum ada penawaran yang bisa dipakai/i).first()
  const qKosong = await expect(pesanQ).toBeVisible({ timeout: 3_000 }).then(
    () => true,
    () => false,
  )
  if (!qKosong) {
    let buktiQ = 0
    try {
      // Jangkar: button#quotationId (id stabil, tanpa ubah UI).
      await page.locator('button#quotationId[role="combobox"]').click({ timeout: 3_000 })
      buktiQ = await page.locator('[role="listbox"] [role="option"]').count()
    } catch {
      buktiQ = 0
    }
    test.skip(buktiQ > 0, "Shard paralel membuat penawaran layak; halaman menampilkan form")
    await expect(pesanQ).toBeVisible({ timeout: 15_000 })
  }
})

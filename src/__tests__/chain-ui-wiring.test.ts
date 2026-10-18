import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga keterhubungan UI yang TIDAK terlihat oleh penjaga lain.
 *
 * `link-wiring.test.ts` memeriksa "parameter yang dikirim UI dibaca halaman
 * tujuan". Kelas celah di sini berbeda dan tiga-tiganya sudah terbukti nyata:
 *
 * 1. Kartu yang HILANG saat daftarnya kosong, sehingga jalan membuat dokumen
 *    berikutnya tidak ada di halaman yang seharusnya menjadi asalnya
 *    (detail Pesanan Penjualan tidak menampilkan kartu Surat Jalan sama sekali
 *    bila belum ada surat jalan, dan tidak punya tombol membuatnya).
 * 2. Daftar pilihan yang TIDAK diteruskan halaman ke form, padahal formnya sudah
 *    punya pilihannya dan kolom penautnya sudah ada di skema (pengeluaran
 *    material dari modul Inventaris tidak bisa ditautkan ke perintah kerja atau
 *    proyek — kolomnya tampil kosong dan menyimpan ulang menghapus tautan lama).
 * 3. Rantai balik yang tidak pernah dirender walau datanya sudah diambil
 *    (halaman faktur tidak menampilkan retur yang menunjuk faktur itu).
 *
 * Semua berkas dibaca teksnya (bukan dirender) mengikuti gaya penjaga repo ini:
 * yang diperiksa adalah keberadaan kontraknya, bukan tata letaknya.
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const PESANAN_DETAIL = "src/app/(dashboard)/penjualan/pesanan/[slug]/page.tsx"
const FAKTUR_DETAIL = "src/app/(dashboard)/penjualan/faktur/[slug]/page.tsx"
const FAKTUR_TAMBAH = "src/app/(dashboard)/penjualan/faktur/tambah/page.tsx"
const WO_DETAIL = "src/app/(dashboard)/produksi/perintah-kerja/[slug]/page.tsx"
const MI_TAMBAH = "src/app/(dashboard)/inventaris/pengeluaran-material/tambah/page.tsx"
const MI_UBAH = "src/app/(dashboard)/inventaris/pengeluaran-material/[slug]/ubah/page.tsx"
const DP_TAMBAH = "src/app/(dashboard)/penjualan/uang-muka/tambah/page.tsx"

describe("keterhubungan UI: kartu, tombol buat, dan daftar pilihan", () => {
  it("detail Pesanan Penjualan selalu menampilkan kartu Surat Jalan beserta jalan membuatnya", () => {
    const src = read(PESANAN_DETAIL)

    // Kartunya tidak boleh lagi dikurung oleh `length > 0`: kalau dikurung, halaman
    // yang justru menjadi asal surat jalan menghilang saat belum ada surat jalan.
    // Diperiksa sebagai LARANGAN pada seluruh berkas, bukan lewat jendela regex —
    // versi pertama penjaga ini memakai jendela 120 karakter sementara jarak dari
    // `&&` ke judul kartu ±265 karakter, sehingga pelanggarannya lolos (terbukti
    // saat falsifikasi). Setelah perbaikan, ungkapan ini tidak dipakai lagi di
    // halaman ini untuk surat jalan; `salesInvoices.length > 0` sah dan berbeda.
    expect(src).not.toContain("deliveryOrders.length > 0")

    // Jalan membuatnya harus ada dan menunjuk halaman yang membaca parameternya.
    expect(src).toContain("/penjualan/surat-jalan/tambah?salesOrderId=${order.id}")

    // Keadaan kosong yang terlihat, bukan kartu kosong tanpa penjelasan.
    expect(src).toContain("Belum ada surat jalan untuk pesanan ini")

    // Tombolnya hanya untuk status yang boleh dikirim — daftar statusnya dipakai
    // bersama dengan aksi server, bukan disalin ulang secara manual.
    expect(src).toContain("DELIVERABLE_ORDER_STATUSES.includes(")
    expect(src).toMatch(
      /import\s*\{[^}]*DELIVERABLE_ORDER_STATUSES[^}]*\}\s*from\s*"@\/lib\/validations\/sales\.schemas"/
    )
  })

  it("detail Faktur menampilkan retur yang menunjuknya, lengkap dengan jalan membuat retur", () => {
    const src = read(FAKTUR_DETAIL)

    // Datanya benar-benar diambil (kedua jalur: bySlug dan byId).
    const includes = src.match(/salesReturns:\s*\{/g) ?? []
    expect(includes.length).toBe(2)

    // Rantai baliknya dirender.
    expect(src).toContain("invoice.salesReturns.map(")
    expect(src).toContain("Belum ada retur untuk faktur ini")

    // Jalan membuatnya menunjuk halaman yang membaca `?invoiceId=`.
    expect(src).toContain("/penjualan/retur/tambah?invoiceId=${invoice.id}")
    expect(read("src/app/(dashboard)/penjualan/retur/tambah/page.tsx")).toContain(
      "params.invoiceId"
    )
  })

  it("detail Pesanan Penjualan selalu menampilkan kartu Faktur beserta jalan membuatnya", () => {
    const src = read(PESANAN_DETAIL)

    // Kartunya tidak boleh lagi dikurung oleh `length > 0`: jalan membuat
    // faktur harus terlihat justru saat belum ada faktur. Sebelum ini kartu
    // Faktur hilang sama sekali dan "+ Faktur" hanya bisa ditebak lewat menu —
    // persis celah kartu Surat Jalan yang sudah ditutup di atas.
    expect(src).not.toContain("salesInvoices.length > 0")

    // Jalan membuatnya harus ada dan menunjuk halaman yang membaca parameternya.
    expect(src).toContain("/penjualan/faktur/tambah?salesOrderId=${order.id}")

    // Keadaan kosong yang terlihat, bukan kartu kosong tanpa penjelasan.
    expect(src).toContain("Belum ada faktur untuk pesanan ini")

    // Tombolnya hanya untuk status yang boleh difakturkan — daftar statusnya
    // dipakai bersama dengan aksi server, bukan disalin ulang secara manual.
    expect(src).toContain("DELIVERABLE_ORDER_STATUSES.includes(")

    // Halaman tujuan benar-benar membaca parameternya dan mem-prefill item.
    const tambah = read(FAKTUR_TAMBAH)
    expect(tambah).toContain("params.salesOrderId")
    expect(tambah).toContain("initialItems")
  })

  it("detail Perintah Kerja selalu menampilkan kartu Pengeluaran Material", () => {
    const src = read(WO_DETAIL)

    // Tombol "Buat Pengeluaran Material" menulis MI langsung lewat aksi —
    // tanpa kartu ini hasilnya tak terlihat dari halaman LO. Sebelum ini
    // halaman hanya membaca satu MI selesai (untuk gerbang tombol) dan tidak
    // pernah merender daftarnya.
    expect(src).toContain("Belum ada pengeluaran material untuk perintah kerja ini")
    expect(src).toContain("/inventaris/pengeluaran-material/tambah?workOrderId=${wo.id}")
    expect(src).toContain("prisma.materialIssue.findMany")
  })

  it("halaman Inventaris meneruskan pilihan perintah kerja & proyek ke form pengeluaran material", () => {
    for (const file of [MI_TAMBAH, MI_UBAH]) {
      const src = read(file)
      expect(src, `${file} harus memuat daftar perintah kerja`).toContain("prisma.workOrder.findMany")
      expect(src, `${file} harus memuat daftar proyek`).toContain("prisma.project.findMany")
      expect(src, `${file} harus meneruskan workOrders ke form`).toMatch(/workOrders=\{workOrders\}/)
      expect(src, `${file} harus meneruskan projects ke form`).toMatch(/projects=\{projects\}/)
    }

    // Form memang memakai prop itu untuk merender pilihannya.
    const form = read("src/components/forms/material-issue-form.tsx")
    expect(form).toContain("workOrders = []")
    expect(form).toContain("projects = []")
  })

  it("pilihan yang tidak diteruskan halaman tidak dianggap aman: bentuk penautnya diperiksa", () => {
    // Kolom penaut di form tidak boleh dikirim saat kosong, kalau tidak menyimpan
    // ulang dokumen lama akan MENGHAPUS tautannya. Ini penjaga untuk sifat itu.
    const form = read("src/components/forms/material-issue-form.tsx")
    expect(form).toMatch(/buildMaterialIssueFormData/)
    const payloadBuilder = form.slice(form.indexOf("buildMaterialIssueFormData"))
    expect(payloadBuilder).toMatch(/workOrderId/)
    expect(payloadBuilder).toMatch(/projectId/)
  })

  it("halaman tambah uang muka dijaga izin buat, bukan izin edit pesanan", () => {
    // Pola §9 laporan rekonsiliasi: guard halaman tambah WAJIB izin create aksi
    // yang di-submit, bukan izin edit dokumen induk. `createDownPayment` menuntut
    // `create_down_payments`; guard `edit_sales_orders` mematikan tombol
    // "+ Uang Muka" untuk peran Finance yang sah.
    const src = read(DP_TAMBAH)
    expect(src).toContain('requirePermission("create_down_payments")')
    expect(src).not.toContain('requirePermission("edit_sales_orders")')
  })
})

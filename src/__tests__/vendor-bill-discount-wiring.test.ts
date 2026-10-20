import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga KONSISTENSI diskon tagihan vendor: penulis dan pembacanya harus sepakat.
 *
 * Keadaan yang diverifikasi di kode: `VendorBill.subtotal` yang dikirim form
 * adalah angka BRUTO (Σ qty × harga, SEBELUM diskon baris), dan TIGA tempat
 * menghitung DPP sebagai `subtotal − discountAmount`. Karena itu
 * `VendorBill.discountAmount` (level dokumen) wajib diisi dengan Σ diskon baris
 * saat tagihan dibuat DAN diubah.
 *
 * Sebelum diperbaiki kolom itu tidak pernah diisi sama sekali (selalu 0), jadi
 * setiap tagihan yang punya diskon baris dilaporkan dengan DPP — dasar pemotongan
 * PPh — LEBIH BESAR daripada dasar yang sebenarnya, sementara `withholdingAmount`
 * yang tersimpan sudah dihitung dari DPP yang benar. Dua angka itu bertentangan,
 * dan tidak ada tes yang menangkapnya.
 *
 * Tes ini berarah dua: kalau salah satu sisi berubah (penulis berhenti mengisi,
 * atau laporan berhenti mengurangi), tes memerahkan supaya keputusannya sadar.
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")

const WRITER = "src/actions/purchase.actions.ts"
const READERS = [
  "src/app/(dashboard)/laporan/pajak/[[...segments]]/page.tsx",
  "src/app/(dashboard)/laporan/bukti-potong-pph/[[...segments]]/page.tsx",
  "src/lib/reports/vat-invoices-data.ts",
]

describe("diskon tagihan vendor: penulis dan pembaca DPP harus sepakat", () => {
  it("pembuat DAN pengubah tagihan mengisi diskon level dokumen dari Σ diskon baris", () => {
    const src = read(WRITER)
    const writes = src.match(/discountAmount: sumBillItemDiscount\(v\.items\)/g) ?? []
    expect(
      writes.length,
      "createVendorBill dan updateVendorBill dua-duanya harus mengisi " +
        "VendorBill.discountAmount; kalau salah satu terlewat, DPP pada tagihan " +
        "yang diubah (atau dibuat) dilaporkan terlalu besar."
    ).toBe(2)
  })

  it("laporan tetap menghitung DPP sebagai subtotal dikurangi diskon dokumen", () => {
    for (const file of READERS) {
      const src = read(file)
      // Dua bentuk sah: hitung mentah yang bisa dipindai, atau helper sen
      // `vatDpp` (diekspor vat-invoices-data, terkunci oleh
      // vat-invoices-cents.test.ts). Keduanya wajib TETAP mengurangi diskon;
      // menghilangkan pengurangan, bukan mengganti bentuk, yang dilarang.
      const rawDiscount = /subtotal\)\s*-\s*Number\([^)]*discountAmount/
      const viaVatDpp = /dpp:\s*vatDpp\([^,]*\.subtotal,\s*[^,]*\.discountAmount/
      expect(
        rawDiscount.test(src) || viaVatDpp.test(src),
        `${file} harus menghitung DPP dari subtotal − discountAmount`
      ).toBe(true)
    }
  })

  it("subtotal yang dikirim form memang BRUTO — dasar asumsi di atas", () => {
    // Kalau form kelak mengirim subtotal yang sudah net, pengurangan di laporan
    // akan menjadi dobel dan asumsi tes ini tidak berlaku lagi.
    const form = read("src/components/forms/vendor-bill-form.tsx")
    expect(form).toMatch(
      /const subtotal = billItems\.reduce\(\s*\(sum, item\) => sum \+ item\.qty \* item\.unitPrice/
    )
    expect(form).toMatch(/const dpp = subtotal - totalDiscount/)
  })
})

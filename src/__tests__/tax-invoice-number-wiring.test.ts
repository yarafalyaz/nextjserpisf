import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * Penjaga nomor faktur pajak (e-Faktur/Coretax): penulis dan pembacanya sepakat.
 *
 * Nomor ini hanya berguna untuk SPT Masa PPN bila rantai lengkapnya utuh:
 * kolom DB ada di kedua dokumen, schema Zod menerima field-nya (tanpa entri di
 * schema, parseFormData membuang nilainya diam-diam), kedua action create DAN
 * update menulisnya, kedua form mengirimnya, dan loader laporan membacanya.
 * Putus di satu titik = nomor yang diketik operator hilang tanpa pesan error.
 * Tes baca-sumber ini memerahkan bila satu titik saja terlewat.
 */

const ROOT = join(__dirname, "..", "..")
const read = (p: string) => readFileSync(join(ROOT, p), "utf8")
const count = (src: string, needle: string) => src.split(needle).length - 1

describe("nomor faktur pajak: rantai simpan → laporan utuh", () => {
  it("schema Prisma punya kolom tax_invoice_number di kedua tabel", () => {
    const schema = read("prisma/schema.prisma")
    expect(count(schema, 'taxInvoiceNumber     String?               @map("tax_invoice_number")') +
      count(schema, 'taxInvoiceNumber    String?                   @map("tax_invoice_number")')).toBe(2)
    const migration = read("prisma/migrations/20261020010000_add_tax_invoice_number/migration.sql")
    expect(migration).toContain("`sales_invoices`")
    expect(migration).toContain("`vendor_bills`")
    expect(count(migration, "`tax_invoice_number`")).toBe(2)
  })

  it("schema Zod penjualan & pembelian menerima taxInvoiceNumber", () => {
    expect(read("src/lib/validations/sales.schemas.ts")).toContain("taxInvoiceNumber,")
    expect(read("src/lib/validations/purchase.schemas.ts")).toContain("taxInvoiceNumber,")
  })

  it("create DAN update kedua dokumen menulis taxInvoiceNumber", () => {
    expect(count(read("src/actions/sales.actions.ts"), "taxInvoiceNumber: v.taxInvoiceNumber ?? null")).toBe(2)
    expect(count(read("src/actions/purchase.actions.ts"), "taxInvoiceNumber: v.taxInvoiceNumber ?? null")).toBe(2)
  })

  it("kedua form mengirim input taxInvoiceNumber, halaman ubah mengisinya", () => {
    expect(read("src/components/forms/sales-invoice-form.tsx")).toContain('id="taxInvoiceNumber"')
    expect(read("src/components/forms/vendor-bill-form.tsx")).toContain('name="taxInvoiceNumber"')
    expect(read("src/app/(dashboard)/penjualan/faktur/[slug]/ubah/page.tsx")).toContain("taxInvoiceNumber: data.taxInvoiceNumber")
    expect(read("src/app/(dashboard)/pembelian/tagihan/[slug]/ubah/page.tsx")).toContain("taxInvoiceNumber: data.taxInvoiceNumber")
  })

  it("loader SPT Masa PPN memilih & memetakan taxInvoiceNumber kedua sisi", () => {
    const loader = read("src/lib/reports/vat-invoices-data.ts")
    expect(count(loader, "taxInvoiceNumber: true")).toBe(2)
    expect(count(loader, "taxInvoiceNumber: invoice.taxInvoiceNumber") +
      count(loader, "taxInvoiceNumber: bill.taxInvoiceNumber")).toBe(2)
  })
})

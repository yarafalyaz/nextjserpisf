import { describe, expect, it } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

/**
 * 120-S: layar ringkasan-ar-ap WAJIB konsumsi loader kanonis loadArApSummary
 * (satu sumber dgn PDF). Layar dilarang query prisma / hitung grandTotal-paid
 * sendiri / saring `> 0` dgn float mentah — ambang tampil ikut loader apa adanya.
 */
const PAGE = path.resolve(__dirname, "..", "page.tsx")

describe("120-S layar ringkasan-ar-ap pakai loader kanonis", () => {
  const source = readFileSync(PAGE, "utf8")

  it("impor loadArApSummary dari ar-ap-summary-data", () => {
    expect(source).toContain("loadArApSummary")
    expect(source).toContain("ar-ap-summary-data")
  })

  it("tidak query prisma langsung", () => {
    expect(source).not.toContain("prisma.salesInvoice")
    expect(source).not.toContain("prisma.vendorBill")
    expect(source).not.toContain("from '@/lib/db/prisma'")
    expect(source).not.toContain('from "@/lib/db/prisma"')
  })

  it("tidak hitung manual grandTotal - paid", () => {
    expect(source).not.toContain("grandTotal")
    expect(source).not.toContain("paidAmount")
  })

  it("tidak saring float mentah `> 0` — ambang ikut loader", () => {
    expect(source).not.toMatch(/outstanding\s*>\s*0/)
  })

  it("label tabel/kolom & judul section tetap (kontrak e2e)", () => {
    for (const label of [
      "Ringkasan AR/AP",
      "Piutang Usaha",
      "Hutang Usaha",
      "Pelanggan",
      "Pemasok",
      "Jumlah Faktur",
      "Jumlah Tagihan",
      "Total Tagihan",
      "Sudah Dibayar",
      "Belum Lunas",
      "Tidak ada piutang belum lunas",
      "Tidak ada hutang belum lunas",
    ]) {
      expect(source).toContain(label)
    }
  })
})

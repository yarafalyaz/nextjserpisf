import { describe, expect, it } from "vitest"
import { buildApByVendor, buildArByCustomer, sumOutstanding } from "../ar-ap-summary"

const three = (id: number) => ({ customerId: id, customerName: "A", grandTotal: 10_000_000.1, paidAmount: 0 })
const rowOf = <T extends { partyId: number }>(rows: T[], id: number) => rows.find((r) => r.partyId === id)

describe("ar-ap-summary safe-math", () => {
  it("3x tagihan 10.000.000,10 satu pelanggan = 30000000.3 persis", () => {
    const rows = buildArByCustomer([three(1), three(1), three(1)])
    expect(rowOf(rows, 1)).toEqual({ partyId: 1, name: "A", count: 3, billed: 30_000_000.3, paid: 0, outstanding: 30_000_000.3 })
    expect(sumOutstanding(rows)).toBe(30_000_000.3)
  })
  it("sisa = billed-paid presisi sen", () => {
    const rows = buildArByCustomer([{ customerId: 1, customerName: "B", grandTotal: "10000000.10", paidAmount: "0.10" }])
    expect(rowOf(rows, 1)?.outstanding).toBe(10_000_000)
  })
  it("AP neto withholding presisi sen", () => {
    const rows = buildApByVendor([{ vendorId: 1, vendorName: "V", grandTotal: 10_000_000.1, withholdingAmount: 0.1, paidAmount: 10_000_000 }])
    expect(rowOf(rows, 1)).toEqual({ partyId: 1, name: "V", count: 1, billed: 10_000_000, paid: 10_000_000, outstanding: 0 })
  })
})

describe("ar-ap-summary agregasi per id pihak (putaran 41)", () => {
  it("dua pelanggan bernama identik tetap dua baris — nama bukan kunci", () => {
    // Customer.name bukan kolom unik; kunci nama akan menggabungkan count,
    // tagihan, dan sisa dua pelanggan berbeda menjadi satu baris salah atribusi.
    const rows = buildArByCustomer([
      { customerId: 1, customerName: "PT Sama", grandTotal: 1_000_000, paidAmount: 0 },
      { customerId: 2, customerName: "PT Sama", grandTotal: 2_000_000, paidAmount: 500_000 },
    ])
    expect(rows).toHaveLength(2)
    expect(rowOf(rows, 1)).toEqual({ partyId: 1, name: "PT Sama", count: 1, billed: 1_000_000, paid: 0, outstanding: 1_000_000 })
    expect(rowOf(rows, 2)).toEqual({ partyId: 2, name: "PT Sama", count: 1, billed: 2_000_000, paid: 500_000, outstanding: 1_500_000 })
    expect(sumOutstanding(rows)).toBe(2_500_000)
  })
  it("dua vendor bernama identik tetap dua baris", () => {
    const rows = buildApByVendor([
      { vendorId: 1, vendorName: "CV Sama", grandTotal: 1_000_000, withholdingAmount: 0, paidAmount: 0 },
      { vendorId: 2, vendorName: "CV Sama", grandTotal: 3_000_000, withholdingAmount: 0, paidAmount: 1_000_000 },
    ])
    expect(rows).toHaveLength(2)
    expect(rowOf(rows, 1)?.outstanding).toBe(1_000_000)
    expect(rowOf(rows, 2)?.outstanding).toBe(2_000_000)
  })
})

describe("ar-ap-summary AP balanceDue kanonis (lanjutan R8-JB-04)", () => {
  it("balanceDue menang dari formula kop: relief retur tidak terhidupkan lagi", () => {
    // Bill 100jt, bayar 60jt, relief retur 40jt → balanceDue 0 (lunas
    // operasional). Formula kop memberi 40jt — laporan lama menagih ulang.
    const rows = buildApByVendor([
      { vendorId: 1, vendorName: "V", grandTotal: 100_000_000, withholdingAmount: 0, paidAmount: 60_000_000, balanceDue: 0 },
    ])
    expect(rowOf(rows, 1)).toEqual({ partyId: 1, name: "V", count: 1, billed: 100_000_000, paid: 60_000_000, outstanding: 0 })
  })
  it("tanpa balanceDue formula kop lama persis (fallback)", () => {
    const rows = buildApByVendor([
      { vendorId: 1, vendorName: "V", grandTotal: 100_000_000, withholdingAmount: 0, paidAmount: 60_000_000 },
    ])
    expect(rowOf(rows, 1)?.outstanding).toBe(40_000_000)
  })
})

describe("ar-ap-summary returnCredit (F-104-V)", () => {
  it("returnCredit kurangi outstanding, kolom paid tetap murni", () => {
    const rows = buildArByCustomer([
      { customerId: 1, customerName: "A", grandTotal: 1_000_000, paidAmount: 200_000, returnCreditAmount: 100_000 },
    ])
    expect(rowOf(rows, 1)).toEqual({ partyId: 1, name: "A", count: 1, billed: 1_000_000, paid: 200_000, outstanding: 700_000 })
  })
  it("tanpa returnCreditAmount rumus lama persis", () => {
    const rows = buildArByCustomer([{ customerId: 1, customerName: "A", grandTotal: 1_000_000, paidAmount: 200_000 }])
    expect(rowOf(rows, 1)?.outstanding).toBe(800_000)
  })
})

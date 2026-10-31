import { describe, expect, it } from "vitest"
import { buildApByVendor, buildArByCustomer, sumOutstanding } from "../ar-ap-summary"

const three = (name: string) => ({ customerName: name, grandTotal: 10_000_000.1, paidAmount: 0 })

describe("ar-ap-summary safe-math", () => {
  it("3x tagihan 10.000.000,10 satu pelanggan = 30000000.3 persis", () => {
    const m = buildArByCustomer([three("A"), three("A"), three("A")])
    expect(m.get("A")).toEqual({ count: 3, billed: 30_000_000.3, paid: 0, outstanding: 30_000_000.3 })
    expect(sumOutstanding([...m.entries()])).toBe(30_000_000.3)
  })
  it("sisa = billed-paid presisi sen", () => {
    const m = buildArByCustomer([{ customerName: "B", grandTotal: "10000000.10", paidAmount: "0.10" }])
    expect(m.get("B")?.outstanding).toBe(10_000_000)
  })
  it("AP neto withholding presisi sen", () => {
    const m = buildApByVendor([{ vendorName: "V", grandTotal: 10_000_000.1, withholdingAmount: 0.1, paidAmount: 10_000_000 }])
    expect(m.get("V")).toEqual({ count: 1, billed: 10_000_000, paid: 10_000_000, outstanding: 0 })
  })
})

describe("ar-ap-summary AP balanceDue kanonis (lanjutan R8-JB-04)", () => {
  it("balanceDue menang dari formula kop: relief retur tidak terhidupkan lagi", () => {
    // Bill 100jt, bayar 60jt, relief retur 40jt → balanceDue 0 (lunas
    // operasional). Formula kop memberi 40jt — laporan lama menagih ulang.
    const m = buildApByVendor([
      { vendorName: "V", grandTotal: 100_000_000, withholdingAmount: 0, paidAmount: 60_000_000, balanceDue: 0 },
    ])
    expect(m.get("V")).toEqual({ count: 1, billed: 100_000_000, paid: 60_000_000, outstanding: 0 })
  })
  it("tanpa balanceDue formula kop lama persis (fallback)", () => {
    const m = buildApByVendor([
      { vendorName: "V", grandTotal: 100_000_000, withholdingAmount: 0, paidAmount: 60_000_000 },
    ])
    expect(m.get("V")?.outstanding).toBe(40_000_000)
  })
})

describe("ar-ap-summary returnCredit (F-104-V)", () => {
  it("returnCredit kurangi outstanding, kolom paid tetap murni", () => {
    const m = buildArByCustomer([
      { customerName: "A", grandTotal: 1_000_000, paidAmount: 200_000, returnCreditAmount: 100_000 },
    ])
    expect(m.get("A")).toEqual({ count: 1, billed: 1_000_000, paid: 200_000, outstanding: 700_000 })
  })
  it("tanpa returnCreditAmount rumus lama persis", () => {
    const m = buildArByCustomer([{ customerName: "A", grandTotal: 1_000_000, paidAmount: 200_000 }])
    expect(m.get("A")?.outstanding).toBe(800_000)
  })
})

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

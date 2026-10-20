import { describe, it, expect } from "vitest"
import { computeDifferenceInvoiceCandidate } from "../job-billing-difference"

// Presisi sen (Decimal 15,2): penjumlahan float mentah membuat selisih
// sejati nol terbaca positif mungil (3 x 0.29 = 0.8699999999999999),
// sehingga faktur selisih hantu bernilai ~1e-16 bisa lahir dan draft-nya
// lalu mengunci porsi itu dari kandidat berikutnya.
describe("computeDifferenceInvoiceCandidate — presisi sen", () => {
  it("selisih sejati nol dari pecahan sen tidak melahirkan faktur hantu", () => {
    const r = computeDifferenceInvoiceCandidate({
      quotationGrandTotal: 0.87,
      invoices: [
        { id: 1, status: "posted", grandTotal: 0.29 },
        { id: 2, status: "posted", grandTotal: 0.29 },
        { id: 3, status: "posted", grandTotal: 0.29 },
      ],
    })
    expect(r.billedAmount).toBe(0.87)
    expect(r.differenceAmount).toBe(0)
    expect(r.eligible).toBe(false)
    expect(r.reason).toContain("sudah tertagih penuh")
  })

  it("total tertagih pecahan sen terakumulasi sen persis", () => {
    const invoices = Array.from({ length: 17 }, (_, i) => ({
      id: i + 1,
      status: "posted",
      grandTotal: 0.24,
    }))
    const r = computeDifferenceInvoiceCandidate({
      quotationGrandTotal: 4.08,
      invoices,
    })
    expect(r.billedAmount).toBe(4.08)
    expect(r.differenceAmount).toBe(0)
    expect(r.eligible).toBe(false)
  })

  it("selisih satu sen tetap eligible sebesar satu sen persis", () => {
    const invoices = Array.from({ length: 17 }, (_, i) => ({
      id: i + 1,
      status: "posted",
      grandTotal: 0.24,
    }))
    const r = computeDifferenceInvoiceCandidate({
      quotationGrandTotal: 4.09,
      invoices,
    })
    expect(r.billedAmount).toBe(4.08)
    expect(r.differenceAmount).toBe(0.01)
    expect(r.eligible).toBe(true)
  })
})

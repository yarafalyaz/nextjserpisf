import { describe, it, expect } from "vitest"
import { computeDifferenceInvoiceCandidate } from "../job-billing-difference"

describe("computeDifferenceInvoiceCandidate (F-2026-10-20-10)", () => {
  it("selisih positif dari invoice posted menjadi kandidat", () => {
    const r = computeDifferenceInvoiceCandidate({
      quotationGrandTotal: 1500000,
      invoices: [{ id: 1, status: "paid", grandTotal: 1000000 }],
    })
    expect(r.eligible).toBe(true)
    expect(r.differenceAmount).toBe(500000)
    expect(r.billedAmount).toBe(1000000)
  })

  it("draft ikut memesan porsi — draft kedua untuk porsi sama ditolak", () => {
    const r = computeDifferenceInvoiceCandidate({
      quotationGrandTotal: 1500000,
      invoices: [
        { id: 1, status: "paid", grandTotal: 1000000 },
        { id: 2, status: "draft", grandTotal: 500000 },
      ],
    })
    expect(r.eligible).toBe(false)
    expect(r.differenceAmount).toBe(0)
  })

  it("invoice cancelled tidak dihitung", () => {
    const r = computeDifferenceInvoiceCandidate({
      quotationGrandTotal: 1500000,
      invoices: [{ id: 1, status: "cancelled", grandTotal: 1000000 }],
    })
    expect(r.eligible).toBe(true)
    expect(r.differenceAmount).toBe(1500000)
  })

  it("selisih negatif ditolak dengan alasan retur/kredit", () => {
    const r = computeDifferenceInvoiceCandidate({
      quotationGrandTotal: 900000,
      invoices: [{ id: 1, status: "posted", grandTotal: 1000000 }],
    })
    expect(r.eligible).toBe(false)
    expect(r.reason).toContain("retur/nota kredit")
  })

  it("tanpa invoice: seluruh nilai berjalan adalah selisih", () => {
    const r = computeDifferenceInvoiceCandidate({ quotationGrandTotal: 250000, invoices: [] })
    expect(r.eligible).toBe(true)
    expect(r.differenceAmount).toBe(250000)
  })
})

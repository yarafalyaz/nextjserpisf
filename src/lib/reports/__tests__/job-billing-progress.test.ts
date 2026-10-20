import { describe, it, expect } from "vitest"
import {
  billedAmountExcludingCancelled,
  computeProgressInvoiceCandidate,
  computeRevisionDownCreditCandidate,
} from "../job-billing-progress"
import { computeDifferenceInvoiceCandidate } from "../job-billing-difference"

describe("billedAmountExcludingCancelled (definisi bersama F-58/F-59 vs faktur selisih)", () => {
  it("cocok billedAmount faktur selisih untuk invoice campuran", () => {
    const invoices = [
      { id: 1, status: "paid", grandTotal: 1000000 },
      { id: 2, status: "cancelled", grandTotal: 500000 },
      { id: 3, status: "draft", grandTotal: 250000 },
    ]
    expect(billedAmountExcludingCancelled(invoices)).toBe(1250000)
    expect(computeDifferenceInvoiceCandidate({ quotationGrandTotal: 2000000, invoices }).billedAmount).toBe(1250000)
  })
})

describe("computeProgressInvoiceCandidate (F-2026-10-20-58)", () => {
  it("termin 40% dari kontrak 10jt, belum tertagih -> progres 4jt", () => {
    const r = computeProgressInvoiceCandidate({ quotationGrandTotal: 10000000, targetPercent: 40, invoices: [] })
    expect(r.eligible).toBe(true)
    expect(r.targetBilled).toBe(4000000)
    expect(r.progressAmount).toBe(4000000)
    expect(r.remainingAfter).toBe(10000000)
  })

  it("progres kedua hanya selisih target kumulatif, bukan persen penuh lagi", () => {
    const r = computeProgressInvoiceCandidate({
      quotationGrandTotal: 10000000,
      targetPercent: 70,
      invoices: [{ id: 1, status: "posted", grandTotal: 4000000 }],
    })
    expect(r.eligible).toBe(true)
    expect(r.progressAmount).toBe(3000000)
    expect(r.remainingAfter).toBe(6000000)
  })

  it("draft ikut memesan porsi — progres untuk porsi sama ditolak", () => {
    const r = computeProgressInvoiceCandidate({
      quotationGrandTotal: 10000000,
      targetPercent: 40,
      invoices: [{ id: 1, status: "draft", grandTotal: 4000000 }],
    })
    expect(r.eligible).toBe(false)
    expect(r.reason).toContain("sudah tertagih penuh")
  })

  it("invoice cancelled tidak dihitung tertagih", () => {
    const r = computeProgressInvoiceCandidate({
      quotationGrandTotal: 10000000,
      targetPercent: 40,
      invoices: [{ id: 1, status: "cancelled", grandTotal: 4000000 }],
    })
    expect(r.eligible).toBe(true)
    expect(r.progressAmount).toBe(4000000)
  })

  it("persen 0 / >100 ditolak", () => {
    expect(computeProgressInvoiceCandidate({ quotationGrandTotal: 10000000, targetPercent: 0, invoices: [] }).eligible).toBe(false)
    expect(computeProgressInvoiceCandidate({ quotationGrandTotal: 10000000, targetPercent: 101, invoices: [] }).eligible).toBe(false)
  })

  it("target di bawah tertagih diarahkan ke kredit revisi-turun", () => {
    const r = computeProgressInvoiceCandidate({
      quotationGrandTotal: 8000000,
      targetPercent: 50,
      invoices: [{ id: 1, status: "posted", grandTotal: 6000000 }],
    })
    expect(r.eligible).toBe(false)
    expect(r.reason).toContain("kredit revisi-turun")
  })

  it("presisi sen: 33% dari 100.10 tidak drift float", () => {
    const r = computeProgressInvoiceCandidate({ quotationGrandTotal: 100.1, targetPercent: 33, invoices: [] })
    expect(r.targetBilled).toBe(33.03)
    expect(r.progressAmount).toBe(33.03)
  })
})

describe("computeRevisionDownCreditCandidate (F-2026-10-20-59 aman)", () => {
  const base = {
    existingRevisionDownCredits: [],
    existingDownPaymentCredits: [],
  }

  it("revisi turun: tertagih 10jt, nilai baru 8jt -> kredit 2jt", () => {
    const r = computeRevisionDownCreditCandidate({
      ...base,
      quotationGrandTotal: 8000000,
      invoices: [{ id: 1, status: "posted", grandTotal: 10000000 }],
      confirmedDownPayments: [],
    })
    expect(r.eligible).toBe(true)
    expect(r.creditAmount).toBe(2000000)
    expect(r.excessAmount).toBe(2000000)
  })

  it("DP confirmed melebihi nilai baru walau invoice kecil -> kredit dari lantai DP", () => {
    const r = computeRevisionDownCreditCandidate({
      ...base,
      quotationGrandTotal: 8000000,
      invoices: [{ id: 1, status: "draft", grandTotal: 3000000 }],
      confirmedDownPayments: [{ amount: 9000000 }],
    })
    expect(r.eligible).toBe(true)
    expect(r.committedAmount).toBe(9000000)
    expect(r.creditAmount).toBe(1000000)
  })

  it("kredit RevisionDown existing mengurangi nominal baru (anti dobel submit)", () => {
    const r = computeRevisionDownCreditCandidate({
      quotationGrandTotal: 8000000,
      invoices: [{ id: 1, status: "posted", grandTotal: 10000000 }],
      confirmedDownPayments: [],
      existingRevisionDownCredits: [{ receivedAmount: 2000000, allocatedAmount: 0, refundedAmount: 0 }],
      existingDownPaymentCredits: [],
    })
    expect(r.eligible).toBe(false)
    expect(r.reason).toContain("sudah tercatat")
  })

  it("kredit DownPayment existing per DP tidak dicatat ulang sebagai RevisionDown", () => {
    const r = computeRevisionDownCreditCandidate({
      quotationGrandTotal: 8000000,
      invoices: [],
      confirmedDownPayments: [{ amount: 9000000 }],
      existingRevisionDownCredits: [],
      existingDownPaymentCredits: [{ receivedAmount: 1000000 }],
    })
    expect(r.eligible).toBe(false)
    expect(r.existingDownPaymentCredit).toBe(1000000)
  })

  it("tanpa kelebihan -> tidak eligible", () => {
    const r = computeRevisionDownCreditCandidate({
      ...base,
      quotationGrandTotal: 10000000,
      invoices: [{ id: 1, status: "posted", grandTotal: 6000000 }],
      confirmedDownPayments: [{ amount: 5000000 }],
    })
    expect(r.eligible).toBe(false)
    expect(r.excessAmount).toBeLessThanOrEqual(0)
  })

  it("invoice cancelled tidak menaikkan committed", () => {
    const r = computeRevisionDownCreditCandidate({
      ...base,
      quotationGrandTotal: 8000000,
      invoices: [{ id: 1, status: "cancelled", grandTotal: 10000000 }],
      confirmedDownPayments: [],
    })
    expect(r.eligible).toBe(false)
    expect(r.billedAmount).toBe(0)
  })
})

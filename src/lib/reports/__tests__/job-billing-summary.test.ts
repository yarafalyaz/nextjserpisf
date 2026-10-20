import { describe, expect, it } from "vitest"

import {
  buildJobBillingSummary,
  isBilledInvoice,
  type JobBillingInvoiceInput,
} from "@/lib/reports/job-billing-summary"

function inv(over: Partial<JobBillingInvoiceInput> = {}): JobBillingInvoiceInput {
  return {
    id: 1,
    documentNo: "INV-0001",
    status: "posted",
    grandTotal: 40_000_000,
    paidAmount: 0,
    deletedAt: null,
    ...over,
  }
}

describe("isBilledInvoice", () => {
  it("posted/partial/paid terhitung; draft/approved/sent/cancelled tidak", () => {
    for (const s of ["posted", "partial", "paid"]) {
      expect(isBilledInvoice(inv({ status: s }))).toBe(true)
    }
    for (const s of ["draft", "approved", "sent", "cancelled"]) {
      expect(isBilledInvoice(inv({ status: s }))).toBe(false)
    }
  })

  it("invoice terhapus (deletedAt) tidak terhitung walau posted", () => {
    expect(isBilledInvoice(inv({ deletedAt: new Date() }))).toBe(false)
  })
})

describe("buildJobBillingSummary — kriteria (c) feature-checker F-2026-10-20-03", () => {
  it("sisa = nilaiBerjalan − Σ posted non-cancelled; draft/cancelled dikecualikan", () => {
    const s = buildJobBillingSummary({
      quotationId: 9,
      quotationDocumentNo: "Q-0009",
      nilaiBerjalan: 100_000_000,
      invoices: [
        inv({ id: 1, grandTotal: 40_000_000, paidAmount: 40_000_000, status: "paid" }),
        inv({ id: 2, grandTotal: 25_000_000, paidAmount: 10_000_000, status: "partial" }),
        inv({ id: 3, grandTotal: 999_000_000, status: "draft" }),
        inv({ id: 4, grandTotal: 888_000_000, status: "cancelled" }),
        inv({ id: 5, grandTotal: 777_000_000, status: "posted", deletedAt: new Date() }),
      ],
      confirmedDownPayments: [{ amount: 30_000_000 }],
    })
    expect(s.sudahDitagih).toBe(65_000_000)
    expect(s.sudahDibayar).toBe(50_000_000)
    expect(s.sisaBelumDitagih).toBe(35_000_000)
    expect(s.sisaBelumDibayar).toBe(15_000_000)
    expect(s.uangMukaDiterima).toBe(30_000_000)
    expect(s.overbilled).toBe(false)
    expect(s.billedInvoices.map((i) => i.id)).toEqual([1, 2])
  })

  it("tanpa invoice: sisa penuh = nilaiBerjalan, DP tidak mengurangi sisa tagihan", () => {
    const s = buildJobBillingSummary({
      quotationId: 9,
      quotationDocumentNo: "Q-0009",
      nilaiBerjalan: 50_000_000,
      invoices: [],
      confirmedDownPayments: [{ amount: 25_000_000 }],
    })
    expect(s.sudahDitagih).toBe(0)
    expect(s.sisaBelumDitagih).toBe(50_000_000)
    expect(s.uangMukaDiterima).toBe(25_000_000)
  })

  it("overbilled: sisa negatif ditandai, tidak di-clamp ke nol", () => {
    const s = buildJobBillingSummary({
      quotationId: 9,
      quotationDocumentNo: "Q-0009",
      nilaiBerjalan: 10_000_000,
      invoices: [inv({ grandTotal: 12_500_000 })],
      confirmedDownPayments: [],
    })
    expect(s.sisaBelumDitagih).toBe(-2_500_000)
    expect(s.overbilled).toBe(true)
  })

  it("mutasi rumus: draft ikut dihitung akan mengubah sisa — rumus terikat status", () => {
    const invoices = [
      inv({ id: 1, grandTotal: 10_000_000 }),
      inv({ id: 2, grandTotal: 90_000_000, status: "draft" }),
    ]
    const s = buildJobBillingSummary({
      quotationId: 9,
      quotationDocumentNo: "Q-0009",
      nilaiBerjalan: 100_000_000,
      invoices,
      confirmedDownPayments: [],
    })
    const mutated = 100_000_000 - invoices.reduce((a, i) => a + i.grandTotal, 0)
    expect(s.sisaBelumDitagih).toBe(90_000_000)
    expect(s.sisaBelumDitagih).not.toBe(mutated)
  })

  it("presisi sen: 0.1 + 0.7 tidak drift", () => {
    const s = buildJobBillingSummary({
      quotationId: 9,
      quotationDocumentNo: "Q-0009",
      nilaiBerjalan: 1,
      invoices: [
        inv({ id: 1, grandTotal: 0.1 }),
        inv({ id: 2, grandTotal: 0.7, status: "paid", paidAmount: 0.7 }),
      ],
      confirmedDownPayments: [],
    })
    expect(s.sudahDitagih).toBe(0.8)
    expect(s.sisaBelumDitagih).toBe(0.2)
  })
})

describe("buildJobBillingSummary — jarak ambang invoice F-2026-10-20-60", () => {
  it("DP di bawah ambang: jarak = ceil(nilai/2) − DP confirmed", () => {
    const s = buildJobBillingSummary({
      quotationId: 9, quotationDocumentNo: "Q-0009", nilaiBerjalan: 100_000_000,
      invoices: [], confirmedDownPayments: [{ amount: 30_000_000 }],
    })
    expect(s.ambangInvoice).toBe(50_000_000)
    expect(s.jarakKeAmbangInvoice).toBe(20_000_000)
    expect(s.ambangInvoiceTercapai).toBe(false)
  })
  it("DP tepat/melebihi ambang: jarak 0 + tercapai (tak negatif)", () => {
    for (const dp of [50_000_000, 60_000_000]) {
      const s = buildJobBillingSummary({
        quotationId: 9, quotationDocumentNo: "Q-0009", nilaiBerjalan: 100_000_000,
        invoices: [], confirmedDownPayments: [{ amount: dp }],
      })
      expect(s.jarakKeAmbangInvoice).toBe(0)
      expect(s.ambangInvoiceTercapai).toBe(true)
    }
  })
  it("sen ganjil: nilai Rp0,01 -> ambang Rp0,01 (ceil sen, cermin hook Rp1->Rp0,50)", () => {
    const s = buildJobBillingSummary({
      quotationId: 9, quotationDocumentNo: "Q-0009", nilaiBerjalan: 0.01,
      invoices: [], confirmedDownPayments: [],
    })
    expect(s.ambangInvoice).toBe(0.01)
    expect(s.jarakKeAmbangInvoice).toBe(0.01)
  })
})

describe("buildJobBillingSummary — kredit terbuka F-2026-10-20-43", () => {
  it("kredit terbuka tampil terpisah; sisaBelumDitagih/Dibayar tak berubah, sisaEfektif tampil saja", () => {
    const s = buildJobBillingSummary({
      quotationId: 9,
      quotationDocumentNo: "Q-0009",
      nilaiBerjalan: 100_000_000,
      invoices: [inv({ id: 1, grandTotal: 40_000_000, paidAmount: 10_000_000, status: "partial" })],
      confirmedDownPayments: [],
      openCustomerCredits: [
        { id: 2, documentNo: "CC-0002", receivedAmount: 28_000_000, allocatedAmount: 3_000_000, refundedAmount: 0 },
        { id: 1, documentNo: "CC-0001", receivedAmount: 5_000_000, allocatedAmount: 5_000_000, refundedAmount: 0 },
      ],
    })
    expect(s.kreditTerbuka).toBe(25_000_000)
    expect(s.openCredits).toEqual([{ id: 2, documentNo: "CC-0002", saldo: 25_000_000 }])
    expect(s.sisaBelumDitagih).toBe(60_000_000)
    expect(s.sisaBelumDibayar).toBe(30_000_000)
    expect(s.sisaEfektif).toBe(5_000_000)
  })

  it("kredit melebihi sisa belum dibayar: sisaEfektif negatif (dana pelanggan di tangan bengkel)", () => {
    const s = buildJobBillingSummary({
      quotationId: 9,
      quotationDocumentNo: "Q-0009",
      nilaiBerjalan: 10_000_000,
      invoices: [inv({ id: 1, grandTotal: 10_000_000, paidAmount: 10_000_000, status: "paid" })],
      confirmedDownPayments: [],
      openCustomerCredits: [
        { id: 1, documentNo: "CC-0001", receivedAmount: 2_500_000, allocatedAmount: 0, refundedAmount: 500_000 },
      ],
    })
    expect(s.kreditTerbuka).toBe(2_000_000)
    expect(s.sisaBelumDibayar).toBe(0)
    expect(s.sisaEfektif).toBe(-2_000_000)
  })

  it("tanpa openCustomerCredits: kredit 0, sisaEfektif = sisaBelumDibayar", () => {
    const s = buildJobBillingSummary({
      quotationId: 9,
      quotationDocumentNo: "Q-0009",
      nilaiBerjalan: 50_000_000,
      invoices: [inv({ id: 1, grandTotal: 20_000_000, paidAmount: 5_000_000, status: "partial" })],
      confirmedDownPayments: [],
    })
    expect(s.kreditTerbuka).toBe(0)
    expect(s.openCredits).toEqual([])
    expect(s.sisaEfektif).toBe(15_000_000)
  })

  it("presisi sen saldo kredit: 17 x 0.24 received tidak drift", () => {
    const credits = Array.from({ length: 17 }, (_, i) => ({
      id: i + 1,
      documentNo: `CC-${i + 1}`,
      receivedAmount: 0.24,
      allocatedAmount: 0,
      refundedAmount: 0,
    }))
    const s = buildJobBillingSummary({
      quotationId: 9,
      quotationDocumentNo: "Q-0009",
      nilaiBerjalan: 100,
      invoices: [],
      confirmedDownPayments: [],
      openCustomerCredits: credits,
    })
    expect(s.kreditTerbuka).toBe(4.08)
    expect(s.openCredits).toHaveLength(17)
  })
})

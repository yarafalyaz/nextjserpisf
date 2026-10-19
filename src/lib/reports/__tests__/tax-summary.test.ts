import { describe, expect, it } from "vitest"

import {
  buildTaxSummaryTotals,
  buildVatReconciliationTotals,
  buildWithholdingTotal,
  taxDocumentBase,
} from "../tax-summary"

describe("tax-summary safe-math", () => {
  it("3x PPN 10.000.000,10 = 30000000.3 persis, bukan drift float", () => {
    const totals = buildTaxSummaryTotals(
      [10_000_000.1, 10_000_000.1, 10_000_000.1],
      [10_000_000.1],
    )
    expect(totals.totalOutput).toBe(30_000_000.3)
    expect(totals.totalInput).toBe(10_000_000.1)
    expect(totals.difference).toBe(20_000_000.2)
    expect(totals.kurangBayar).toBe(true)
  })

  it("rekonsiliasi PPN: buku vs dokumen tanpa drift", () => {
    const totals = buildVatReconciliationTotals({
      outputEntries: [
        { credit: 10_000_000.1, debit: 0 },
        { credit: 10_000_000.1, debit: 0 },
        { credit: 10_000_000.1, debit: 0 },
      ],
      inputEntries: [{ debit: 10_000_000.1, credit: 0 }],
      docOutputAmounts: [10_000_000.1, 10_000_000.1, 10_000_000.1],
      docInputAmounts: [10_000_000.1],
    })
    expect(totals.bookOutput).toBe(30_000_000.3)
    expect(totals.docOutput).toBe(30_000_000.3)
    expect(totals.netDifference).toBe(0)
  })

  it("total bukti potong PPh tanpa drift", () => {
    expect(buildWithholdingTotal([10_000_000.1, 10_000_000.1, 10_000_000.1])).toBe(30_000_000.3)
  })

  it("DPP = subtotal - diskon presisi sen", () => {
    expect(taxDocumentBase(10_000_000.1, 0.1)).toBe(10_000_000)
  })
})

import { describe, expect, it } from "vitest"

import { applyChainHeads, linkPurchaseReturns } from "@/lib/reports/vat-invoices-data"

const bill = (documentNo: string, vendorId: number) => ({ documentNo, vendorId })
const ret = (documentNo: string, poNo: string, vendorId: number) => ({
  documentNo,
  purchaseOrder: { documentNo: poNo, vendorId },
})

describe("linkPurchaseReturns", () => {
  it("menautkan retur ke satu-satunya tagihan vendor pada periode", () => {
    const linked = linkPurchaseReturns([bill("BILL-001", 7)], [ret("PR-001", "PO-001", 7)])

    expect(linked.get("BILL-001")).toEqual({ documentNo: "PR-001", sourceDocumentNo: "PO-001" })
  })

  it("tidak menautkan bila vendor punya lebih dari satu tagihan (ambigu)", () => {
    const linked = linkPurchaseReturns(
      [bill("BILL-001", 7), bill("BILL-002", 7)],
      [ret("PR-001", "PO-001", 7)],
    )

    expect(linked.size).toBe(0)
  })

  it("tidak menautkan bila vendor PO berbeda dari vendor tagihan", () => {
    const linked = linkPurchaseReturns([bill("BILL-001", 8)], [ret("PR-001", "PO-001", 7)])

    expect(linked.size).toBe(0)
  })
})

describe("applyChainHeads (dedupe TaxInvoice laporan faktur-ppn)", () => {
  type Doc = { id: number; tag: string }
  type TI = {
    id: number; replacesId: number | null; djpStatus: string
    dpp: number; taxAmount: number; salesInvoiceId: number | null; vendorBillId: number | null
  }
  const docs: Doc[] = [{ id: 1, tag: "A" }, { id: 2, tag: "B" }, { id: 3, tag: "C" }]
  const map = (doc: Doc, head: { dpp: number; taxAmount: number } | null) =>
    head ? { ...doc, tag: `${doc.tag}:${head.dpp}/${head.taxAmount}` } : doc

  it("faktur dibatalkan: dokumen dibuang (nol-efek, sama seperti SPT)", () => {
    const tis: TI[] = [
      { id: 10, replacesId: null, djpStatus: "cancelled", dpp: 11_000_000, taxAmount: 1_320_000, salesInvoiceId: 1, vendorBillId: null },
    ]
    const out = applyChainHeads(docs, tis, "salesInvoiceId", map)
    expect(out.map((d) => d.id)).toEqual([2, 3])
  })

  it("faktur diganti: dokumen tampil nilai kepala rantai (pengganti approved)", () => {
    const tis: TI[] = [
      { id: 10, replacesId: null, djpStatus: "replaced", dpp: 11_000_000, taxAmount: 1_320_000, salesInvoiceId: 1, vendorBillId: null },
      { id: 11, replacesId: 10, djpStatus: "approved", dpp: 5_500_000, taxAmount: 660_000, salesInvoiceId: 1, vendorBillId: null },
    ]
    const out = applyChainHeads(docs, tis, "salesInvoiceId", map)
    expect(out.find((d) => d.id === 1)?.tag).toBe("A:5500000/660000")
    expect(out.map((d) => d.id)).toEqual([1, 2, 3])
  })

  it("pengganti masih draft: dokumen dibuang sampai pengganti approved", () => {
    const tis: TI[] = [
      { id: 10, replacesId: null, djpStatus: "replaced", dpp: 11_000_000, taxAmount: 1_320_000, salesInvoiceId: 1, vendorBillId: null },
      { id: 11, replacesId: 10, djpStatus: "draft", dpp: 5_500_000, taxAmount: 660_000, salesInvoiceId: 1, vendorBillId: null },
    ]
    const out = applyChainHeads(docs, tis, "salesInvoiceId", map)
    expect(out.map((d) => d.id)).toEqual([2, 3])
  })

  it("tanpa TaxInvoice: dokumen lolos apa adanya (legacy)", () => {
    const out = applyChainHeads(docs, [], "salesInvoiceId", map)
    expect(out).toEqual(docs)
  })
})

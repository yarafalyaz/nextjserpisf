import { describe, expect, it } from "vitest"

import { linkPurchaseReturns } from "@/lib/reports/vat-invoices-data"

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

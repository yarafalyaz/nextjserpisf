import { describe, expect, it } from "vitest"

import { salesInvoiceLabel } from "../invoice-label"

describe("salesInvoiceLabel", () => {
  it("uses the official document number once one exists", () => {
    expect(
      salesInvoiceLabel({ id: 11, documentNo: "001/INV/YRA/10/2026" }),
    ).toBe("001/INV/YRA/10/2026")
  })

  it("falls back to the internal draft identity before posting", () => {
    expect(salesInvoiceLabel({ id: 11, documentNo: null })).toBe("DRAFT #11")
    expect(salesInvoiceLabel({ id: 12, documentNo: undefined })).toBe(
      "DRAFT #12",
    )
  })
})

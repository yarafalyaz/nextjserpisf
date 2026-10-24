import { describe, it, expect } from "vitest"

import {
  buildQuotationFollowUpQueue,
  type QuotationFollowUpInput,
} from "@/lib/reports/quotation-followup-queue"
import {
  buildQuotationFollowUpCsv,
  buildQuotationFollowUpExportRows,
  QUOTATION_FOLLOWUP_EXPORT_HEADERS,
} from "@/lib/reports/quotation-followup-export"

const NOW = new Date(Date.UTC(2026, 9, 22, 3, 0))

function input(over: Partial<QuotationFollowUpInput>): QuotationFollowUpInput {
  return {
    quotationId: 1,
    slug: "penawaran-1",
    documentNo: "Q-0001",
    customerId: 10,
    customerName: "PT Sinar Abadi",
    phone: "0812-3456-7890",
    contactPerson: "Budi Kontak",
    salesEmployeeId: null,
    salesEmployeeName: null,
    date: new Date(Date.UTC(2026, 9, 10)),
    validUntil: null,
    grandTotal: 1500000,
    ...over,
  }
}

describe("quotation-followup-export F-2026-10-22-091-S Q-QF-4", () => {
  it("ekspor tanpa kolom kontak: phone/contactPerson tidak bocor ke CSV", () => {
    const rows = buildQuotationFollowUpQueue([input({})], NOW)
    const csv = buildQuotationFollowUpCsv(rows)
    expect(csv).not.toContain("0812-3456-7890")
    expect(csv).not.toContain("Budi Kontak")
    expect(csv.split("\n")[0]).toBe(QUOTATION_FOLLOWUP_EXPORT_HEADERS.join(","))
    const exported = buildQuotationFollowUpExportRows(rows)
    expect(exported[0]).toHaveLength(QUOTATION_FOLLOWUP_EXPORT_HEADERS.length)
    // TANPA_BATAS: Masa Berlaku + Sisa Hari `—`, Penjual `—`, label verbatim.
    expect(exported[0]?.[2]).toBe("—")
    expect(exported[0]?.[4]).toBe("—")
    expect(exported[0]?.[5]).toBe("—")
    expect(exported[0]?.[7]).toBe("Tanpa Masa Berlaku")
  })
})

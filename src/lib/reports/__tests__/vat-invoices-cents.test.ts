import { describe, expect, it } from "vitest"

import { vatDpp } from "@/lib/reports/vat-invoices-data"
import { buildVatInvoiceList, type VatInvoiceInput } from "@/lib/reports/vat-invoices"

function invoice(overrides: Partial<VatInvoiceInput> = {}): VatInvoiceInput {
  return {
    date: new Date(2026, 9, 5),
    documentNo: "INV-001",
    counterparty: "PT Pelanggan",
    dpp: 0.24,
    vat: 0.24,
    total: 100.1,
    ...overrides,
  }
}

describe("Faktur PPN presisi sen", () => {
  it("DPP = subtotal − diskon presisi sen, bukan float mentah", () => {
    expect(vatDpp(100.1, 0.2)).toBe(99.9)
    expect(vatDpp(0.37, 0.13)).toBe(0.24)
  })

  it("jumlah 17 faktur sen tidak melayang (float mentah = 4.080000000000002)", () => {
    const items = Array.from({ length: 17 }, (_, i) => invoice({ documentNo: `INV-${i}` }))
    const result = buildVatInvoiceList({ output: items, input: items })

    expect(result.output.dpp).toBe(4.08)
    expect(result.output.vat).toBe(4.08)
    expect(result.output.total).toBe(1701.7)
    expect(result.input.dpp).toBe(4.08)
  })

  it("posisi PPN = keluaran − masukan presisi sen", () => {
    const result = buildVatInvoiceList({
      output: Array.from({ length: 17 }, (_, i) => invoice({ documentNo: `OUT-${i}` })),
      input: [invoice({ documentNo: "IN-1", dpp: 0.12, vat: 0.12, total: 50.05 })],
    })

    expect(result.netVat).toBe(3.96)
    const grand = result.table.rows.find((r) => r.kind === "total" && r.grand)
    expect(grand?.kind === "total" ? grand.cells.join("|") : "").not.toContain("000000")
  })
})

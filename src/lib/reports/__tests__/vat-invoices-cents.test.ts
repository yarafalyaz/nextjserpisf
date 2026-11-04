import { describe, expect, it } from "vitest"

import { vatDpp } from "@/lib/reports/vat-invoices-data"
import { buildVatInvoiceList, vatInvoiceSummary, type VatInvoiceInput } from "@/lib/reports/vat-invoices"

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

  it("posisi PPN setengah rupiah tidak dibulatkan jadi Rp 1", () => {
    const result = buildVatInvoiceList({
      output: [invoice({ documentNo: "OUT-1", dpp: 100.5, vat: 100.5, total: 201 })],
      input: [],
    })

    expect(result.netVat).toBe(100.5)
    const grand = result.table.rows.find((r) => r.kind === "total" && r.grand)
    expect(grand?.kind === "total" ? grand.cells[1] : "").toBe("100,50")
    expect(result.verdict).toContain("100,50")
    expect(result.verdict).not.toContain("Rp 101")
  })

  it("ringkasan faktur PPN menyebut posisi hingga sen", () => {
    const result = buildVatInvoiceList({
      output: [invoice({ documentNo: "OUT-1", dpp: 100.5, vat: 100.5, total: 201 })],
      input: [],
    })

    expect(vatInvoiceSummary(result)).toContain("100,50")
  })
})

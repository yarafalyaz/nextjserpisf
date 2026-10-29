import { describe, it, expect } from "vitest"
import { buildPayablesSummary, type PayableBill } from "../payables-summary"

/**
 * E140 (vonis F-2026-10-28-152-V, jawaban spec 140-S):
 * - E140-1 (D1): sisa Rp0,50/Rp1,00 = lunas FIN-BR-006 → tampil di Total Hutang = MERAH.
 * - E140-6 (kontrol arah): sisa Rp1,01 tampil = HIJAU.
 * - E140-2 (D2): tagihan posted bersisa tanpa dueDate (ber-PPh) → Jumlah Hutang
 *   inklusif mencakupnya sebesar NETO (grandTotal − withholding − paid).
 */

const asOf = new Date(2026, 5, 30)

function bill(overrides: Partial<PayableBill>): PayableBill {
  return {
    vendorId: 1,
    vendorName: "PT Uji",
    documentNo: "VB-000",
    dueDate: new Date(2026, 5, 15),
    grandTotal: 0,
    paidAmount: 0,
    ...overrides,
  }
}

describe("E140-1 gate isOutstandingSettled Rp1", () => {
  it("sisa Rp0,50 tidak tampil (paid FIN-BR-006)", () => {
    const summary = buildPayablesSummary(
      [bill({ documentNo: "VB-E140-1A", grandTotal: 100, paidAmount: 99.5 })],
      asOf,
    )
    expect(summary.rows.map((r) => r.documentNo)).not.toContain("VB-E140-1A")
    expect(summary.totalOutstanding).toBe(0)
  })

  it("sisa tepat Rp1,00 tidak tampil", () => {
    const summary = buildPayablesSummary(
      [bill({ documentNo: "VB-E140-1B", grandTotal: 100, paidAmount: 99 })],
      asOf,
    )
    expect(summary.rows.map((r) => r.documentNo)).not.toContain("VB-E140-1B")
    expect(summary.totalOutstanding).toBe(0)
  })

  it("kontrol arah: sisa Rp1,01 tetap tampil", () => {
    const summary = buildPayablesSummary(
      [bill({ documentNo: "VB-E140-1C", grandTotal: 100, paidAmount: 98.99 })],
      asOf,
    )
    expect(summary.rows.map((r) => r.documentNo)).toContain("VB-E140-1C")
    expect(summary.totalOutstanding).toBe(1.01)
  })
})

describe("E140-2 tanpa-dueDate ber-PPh masuk Jumlah Hutang sebesar NETO", () => {
  it("gross 1jt PPh 100rb tanpa dueDate → sisa NETO 900rb tercakup", () => {
    const summary = buildPayablesSummary(
      [
        bill({
          documentNo: "VB-E140-2",
          dueDate: null,
          grandTotal: 1_000_000,
          withholdingAmount: 100_000,
          paidAmount: 0,
        }),
      ],
      asOf,
    )
    const row = summary.rows.find((r) => r.documentNo === "VB-E140-2")
    expect(row?.outstanding).toBe(900_000)
    expect(summary.totalOutstanding).toBe(900_000)
    expect(summary.noDueDateOutstanding).toBe(900_000)
  })
})

import { describe, it, expect } from "vitest"
import { buildPayablesSummary, type PayableBill } from "../payables-summary"

/**
 * P0-2: sisa utang supplier = NETO (grandTotal − withholding) − terbayar.
 * Skenario dokumen: gross Rp1.000.000, PPh Rp100.000, neto Rp900.000.
 * Bayar Rp900.000 → sisa supplier Rp0 (utang PPh Rp100.000 tercatat di
 * akun hutang PPh, bukan di sisa tagihan).
 */

const asOf = new Date(2026, 5, 30)

function bill(overrides: Partial<PayableBill>): PayableBill {
  return {
    vendorId: 1,
    vendorName: "PT Maklon",
    documentNo: "VB-000",
    dueDate: new Date(2026, 5, 15),
    grandTotal: 0,
    paidAmount: 0,
    ...overrides,
  }
}

describe("sisa tagihan neto setelah withholding (P0-2)", () => {
  it("gross 1jt, PPh 100rb, bayar 900rb → sisa 0, tagihan keluar dari baris", () => {
    const bills = [
      bill({ documentNo: "VB-001", grandTotal: 1_000_000, withholdingAmount: 100_000, paidAmount: 900_000 }),
    ]
    const summary = buildPayablesSummary(bills, asOf)
    expect(summary.rows.map((r) => r.documentNo)).not.toContain("VB-001")
    expect(summary.totalOutstanding).toBe(0)
  })

  it("sebelum bayar: sisa = neto 900rb, bukan bruto 1jt", () => {
    const bills = [
      bill({ documentNo: "VB-001", grandTotal: 1_000_000, withholdingAmount: 100_000, paidAmount: 0 }),
    ]
    const summary = buildPayablesSummary(bills, asOf)
    const row = summary.rows.find((r) => r.documentNo === "VB-001")
    expect(row?.outstanding).toBe(900_000)
  })

  it("bayar parsial 400rb dari neto 900rb → sisa 500rb", () => {
    const bills = [
      bill({ documentNo: "VB-001", grandTotal: 1_000_000, withholdingAmount: 100_000, paidAmount: 400_000 }),
    ]
    const summary = buildPayablesSummary(bills, asOf)
    const row = summary.rows.find((r) => r.documentNo === "VB-001")
    expect(row?.outstanding).toBe(500_000)
  })

  it("per-vendor totalBilled neto: billed − paid = outstanding, konsisten summary", () => {
    const bills = [
      bill({ documentNo: "VB-001", grandTotal: 1_000_000, withholdingAmount: 100_000, paidAmount: 400_000 }),
    ]
    const summary = buildPayablesSummary(bills, asOf)
    expect(summary.totalBilled).toBe(900_000)
    expect(summary.vendors).toHaveLength(1)
    expect(summary.vendors[0].totalBilled).toBe(900_000)
    expect(summary.vendors[0].totalPaid).toBe(400_000)
    expect(summary.vendors[0].outstanding).toBe(500_000)
    expect(summary.vendors[0].totalBilled - summary.vendors[0].totalPaid).toBe(summary.vendors[0].outstanding)
  })

  it("tanpa withholding: perilaku lama tetap (sisa = grandTotal − paid)", () => {
    const bills = [
      bill({ documentNo: "VB-002", grandTotal: 500_000, paidAmount: 200_000 }),
    ]
    const summary = buildPayablesSummary(bills, asOf)
    const row = summary.rows.find((r) => r.documentNo === "VB-002")
    expect(row?.outstanding).toBe(300_000)
  })
})

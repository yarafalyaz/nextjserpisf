import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Ambang "dianggap lunas" FIN-BR-006 (Rp1) harus SAMA di seluruh laporan
 * populasi. Aging/collection-queue/statement memakai `isOutstandingSettled`;
 * loader ringkasan AR/AP dan piutang per pelanggan/kendaraan dulu memakai
 * `outstanding > 0`, sehingga faktur Rp1.000.000,50 yang dibayar Rp999.999,70
 * (status dokumen `paid`) tetap tampil sebagai piutang.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    salesInvoice: { findMany: vi.fn() },
    vendorBill: { findMany: vi.fn() },
  },
  loadReturnCreditByInvoiceId: vi.fn(async () => new Map<number, number>()),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/reports/return-credit", () => ({
  loadReturnCreditByInvoiceId: mocks.loadReturnCreditByInvoiceId,
}))

import { loadArApSummary } from "../ar-ap-summary-data"
import { aggregateCustomerReceivables } from "../ledger-cash-data"
import { groupReceivablesByVehicle } from "../receivables-by-vehicle-data"
import { derivePaymentStatus } from "@/lib/finance/settlement-status"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
  mocks.prismaMock.vendorBill.findMany.mockResolvedValue([])
  mocks.loadReturnCreditByInvoiceId.mockResolvedValue(new Map())
})

describe("laporan populasi memakai ambang lunas FIN-BR-006", () => {
  it("ringkasan AR/AP tidak menampilkan faktur yang sudah lunas dalam toleransi Rp1", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      // Sisa 0,80 → status dokumen "paid" lewat toleransi Rp1.
      { id: 1, customerId: 1, grandTotal: 1_000_000.5, paidAmount: 999_999.7, customer: { name: "PT Lunas" } },
      // Sisa material → tetap piutang.
      { id: 2, customerId: 2, grandTotal: 500_000, paidAmount: 100_000, customer: { name: "PT Utang" } },
    ])

    const report = await loadArApSummary()

    const parties = report.table.rows
      .filter((row) => row.kind === "data")
      .map((row) => (row.kind === "data" ? row.cells[0] : ""))
    expect(parties).toContain("PT Utang")
    expect(parties).not.toContain("PT Lunas")
    expect(derivePaymentStatus(1_000_000.5, 999_999.7)).toBe("paid")
  })

  it("piutang per pelanggan membuang sisa dalam toleransi", () => {
    const buckets = aggregateCustomerReceivables(
      [{ customerId: 1, customerName: "PT Lunas", creditLimit: 0, grandTotal: 1_000_000.5, paidAmount: 999_999.7, dueDate: null }],
      new Date(2026, 9, 31),
    )

    expect(buckets).toHaveLength(0)
  })

  it("piutang per kendaraan membuang sisa dalam toleransi", () => {
    const rows = groupReceivablesByVehicle(
      [{ plateLabel: "B 1 AA", grandTotal: 1_000_000.5, paidAmount: 999_999.7, dueDate: null }],
      new Date(2026, 9, 31),
    )

    expect(rows).toHaveLength(0)
  })
})

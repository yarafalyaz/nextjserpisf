import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-21-032 loader — yang dijaga:
 * - query faktur hanya status recognised (cancelled/draft tidak muncul, AC-3),
 * - payment diklasifikasi kredit dari paymentMethod "customer_credit",
 *   nomor kredit dipulihkan dari notes (bukan dari allocatedAmount),
 * - pelanggan tak dikenal → statement kosong, bukan error (AC-4 di loader).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    customer: { findFirst: vi.fn() },
    salesInvoice: { findMany: vi.fn() },
    salesPayment: { findMany: vi.fn() },
    salesReturn: { findMany: vi.fn() },
    journal: { findMany: vi.fn() },
  },
  getSystemSettings: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: mocks.getSystemSettings }))

import { creditDocumentNoFromNotes, loadCustomerStatement } from "../customer-statement-data"

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`)

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.customer.findFirst.mockResolvedValue({ id: 7, name: "CV Uji" })
  mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
  mocks.prismaMock.salesPayment.findMany.mockResolvedValue([])
  mocks.prismaMock.salesReturn.findMany.mockResolvedValue([])
  mocks.prismaMock.journal.findMany.mockResolvedValue([])
  mocks.getSystemSettings.mockResolvedValue({ salesReceivableAccountId: 110 })
})

describe("creditDocumentNoFromNotes", () => {
  it("memulihkan nomor kredit dari notes alokasi service", () => {
    expect(creditDocumentNoFromNotes("Alokasi kredit pelanggan CRD-001 [idem:abcd1234]")).toBe("CRD-001")
    expect(creditDocumentNoFromNotes("Pembayaran biasa")).toBeNull()
    expect(creditDocumentNoFromNotes(null)).toBeNull()
  })
})

describe("loadCustomerStatement", () => {
  it("query faktur memakai status recognised + deletedAt null (cancelled absen)", async () => {
    await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerId: 7,
          status: { in: ["posted", "partial", "paid"] },
          deletedAt: null,
        }),
      }),
    )
  })

  it("payment customer_credit menjadi baris kredit dengan nomor dokumen kredit", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 2, documentNo: "INV-002", date: D("2026-02-05"), grandTotal: 500_000 },
    ])
    mocks.prismaMock.salesPayment.findMany.mockResolvedValue([
      {
        id: 13, documentNo: "PAY-013", salesInvoiceId: 2, paymentDate: D("2026-02-12"),
        amount: 150_000, withholdingAmount: 0, paymentMethod: "customer_credit",
        notes: "Alokasi kredit pelanggan CRD-001 [idem:abcd1234]",
        salesInvoice: { documentNo: "INV-002" },
      },
    ])

    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })

    expect(report.customer).toEqual({ id: 7, name: "CV Uji" })
    expect(report.statement.entries).toHaveLength(2)
    const credit = report.statement.entries.find((e) => e.kind === "credit")
    expect(credit).toMatchObject({ documentNo: "PAY-013", credit: 150_000 })
    expect(credit?.description).toContain("CRD-001")
    expect(report.statement.closingBalance).toBe(350_000)
  })

  it("pelanggan tanpa dokumen → saldo 0, baris kosong + notice, bukan error", async () => {
    mocks.prismaMock.customer.findFirst.mockResolvedValue(null)
    const report = await loadCustomerStatement(404, { start: D("2026-02-01"), end: D("2026-02-28") })
    expect(report.customer).toBeNull()
    expect(report.statement.openingBalance).toBe(0)
    expect(report.statement.closingBalance).toBe(0)
    expect(report.statement.entries).toEqual([])
    expect(report.table.rows.some((r) => r.kind === "notice")).toBe(true)
  })

  it("F-104-V: retur completed + jurnal POSTED Cr Piutang → baris return; query jurnal hanya POSTED", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 2, documentNo: "INV-002", date: D("2026-02-05"), grandTotal: 500_000 },
    ])
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue([
      {
        id: 21, documentNo: "RET-001", salesInvoiceId: 2, date: D("2026-02-15"),
        salesInvoice: { documentNo: "INV-002" },
      },
    ])
    mocks.prismaMock.journal.findMany.mockResolvedValue([
      { referenceId: 21, entries: [{ credit: 100_000 }] },
    ])

    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })

    expect(mocks.prismaMock.salesReturn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ customerId: 7, status: "completed", salesInvoiceId: { not: null } }),
      }),
    )
    expect(mocks.prismaMock.journal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null, status: "POSTED", referenceType: "SalesReturn", referenceId: { in: [21] },
        }),
      }),
    )
    const row = report.statement.entries.find((e) => e.kind === "return")
    expect(row).toMatchObject({ documentNo: "RET-001", credit: 100_000 })
    expect(report.statement.closingBalance).toBe(400_000)
  })

  it("F-104-V: akun Piutang belum terkonfigurasi → returnCredit 0, statement tetap jalan", async () => {
    mocks.getSystemSettings.mockResolvedValue({ salesReceivableAccountId: null })
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 2, documentNo: "INV-002", date: D("2026-02-05"), grandTotal: 500_000 },
    ])
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue([
      {
        id: 21, documentNo: "RET-001", salesInvoiceId: 2, date: D("2026-02-15"),
        salesInvoice: { documentNo: "INV-002" },
      },
    ])

    const report = await loadCustomerStatement(7, { start: D("2026-02-01"), end: D("2026-02-28") })

    expect(mocks.prismaMock.journal.findMany).not.toHaveBeenCalled()
    expect(report.statement.entries.some((e) => e.kind === "return")).toBe(false)
    expect(report.statement.closingBalance).toBe(500_000)
  })
})

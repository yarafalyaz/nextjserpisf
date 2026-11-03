import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Putaran 100: cek "baris koran belum matched" di Proses Akhir Bulan dulu
 * menghitung `BankStatementLine.status != "matched"` mentah — padahal tak
 * ada penulis produksi yang menulis status itu; pencocokan hidup di
 * `BankReconciliationItem.matched`. Baris yang sudah tercocok tetap
 * dihitung belum matched selamanya. Loader kini menilai definisi ganda
 * yang sama seperti laporan rekonsiliasi bank.
 */

const mocks = vi.hoisted(() => ({
  systemSettingFindFirst: vi.fn(),
  journalCount: vi.fn(),
  salesInvoiceCount: vi.fn(),
  vendorBillCount: vi.fn(),
  bankReconciliationCount: vi.fn(),
  goodsReceiptCount: vi.fn(),
  bankStatementLineFindMany: vi.fn(),
  bankReconciliationItemFindMany: vi.fn(),
  payrollCount: vi.fn(),
  itemCount: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    systemSetting: { findFirst: mocks.systemSettingFindFirst },
    journal: { count: mocks.journalCount },
    salesInvoice: { count: mocks.salesInvoiceCount },
    vendorBill: { count: mocks.vendorBillCount },
    bankReconciliation: { count: mocks.bankReconciliationCount },
    goodsReceipt: { count: mocks.goodsReceiptCount },
    bankStatementLine: { findMany: mocks.bankStatementLineFindMany },
    bankReconciliationItem: { findMany: mocks.bankReconciliationItemFindMany },
    payroll: { count: mocks.payrollCount },
    item: { count: mocks.itemCount },
  },
}))

import { loadPeriodClose } from "../period-close-data"

function unmatchedCount(result: Awaited<ReturnType<typeof loadPeriodClose>>) {
  const check = result.result.checks.find((c) => c.key === "unmatchedStatementLines")
  return check?.count
}

describe("loadPeriodClose — baris koran belum matched (putaran 100)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.systemSettingFindFirst.mockResolvedValue({ periodLockDate: null })
    for (const m of [
      mocks.journalCount,
      mocks.salesInvoiceCount,
      mocks.vendorBillCount,
      mocks.bankReconciliationCount,
      mocks.goodsReceiptCount,
      mocks.payrollCount,
      mocks.itemCount,
    ]) {
      m.mockResolvedValue(0)
    }
    mocks.bankReconciliationItemFindMany.mockResolvedValue([])
  })

  it("baris tercocok lewat item rekonsiliasi TIDAK dihitung belum matched", async () => {
    mocks.bankStatementLineFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }])
    mocks.bankReconciliationItemFindMany.mockResolvedValue([
      { bankStatementLineId: 1 },
      { bankStatementLineId: 3 },
    ])

    const data = await loadPeriodClose("2026-10")

    expect(unmatchedCount(data)).toBe(1)
    expect(mocks.bankReconciliationItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ matched: true }),
      }),
    )
  })

  it("tanpa baris kandidat: item rekonsiliasi tidak ditanya, hitungan nol", async () => {
    mocks.bankStatementLineFindMany.mockResolvedValue([])

    const data = await loadPeriodClose("2026-10")

    expect(unmatchedCount(data)).toBe(0)
    expect(mocks.bankReconciliationItemFindMany).not.toHaveBeenCalled()
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-23-104-V Putusan 2 — helper returnCredit bersama:
 * - hanya jurnal SalesReturn POSTED (query status POSTED) yang dihitung,
 * - per retur dan agregat per faktur konsisten,
 * - akun Piutang belum terkonfigurasi → 0 semua, tanpa query jurnal.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    salesReturn: { findMany: vi.fn() },
    journal: { findMany: vi.fn() },
  },
  getSystemSettings: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: mocks.getSystemSettings }))

import {
  loadReturnCreditByInvoiceId,
  loadReturnCreditByReturnId,
} from "../return-credit"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.salesReturn.findMany.mockResolvedValue([])
  mocks.prismaMock.journal.findMany.mockResolvedValue([])
  mocks.getSystemSettings.mockResolvedValue({ salesReceivableAccountId: 110 })
})

describe("loadReturnCreditByReturnId", () => {
  it("query jurnal hanya POSTED + referenceType SalesReturn; jumlahkan kaki Cr Piutang", async () => {
    mocks.prismaMock.journal.findMany.mockResolvedValue([
      { referenceId: 21, entries: [{ credit: 60_000 }, { credit: 40_000 }] },
      { referenceId: 22, entries: [{ credit: 0 }] },
    ])
    const map = await loadReturnCreditByReturnId([21, 22])
    expect(mocks.prismaMock.journal.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          deletedAt: null,
          status: "POSTED",
          referenceType: "SalesReturn",
          referenceId: { in: [21, 22] },
        }),
      }),
    )
    expect(map.get(21)).toBe(100_000)
    expect(map.has(22)).toBe(false)
  })

  it("akun Piutang kosong → map kosong, jurnal tidak ditanya", async () => {
    mocks.getSystemSettings.mockResolvedValue({ salesReceivableAccountId: null })
    const map = await loadReturnCreditByReturnId([21])
    expect(map.size).toBe(0)
    expect(mocks.prismaMock.journal.findMany).not.toHaveBeenCalled()
  })

  it("daftar kosong → map kosong tanpa query", async () => {
    const map = await loadReturnCreditByReturnId([])
    expect(map.size).toBe(0)
    expect(mocks.prismaMock.journal.findMany).not.toHaveBeenCalled()
  })
})

describe("loadReturnCreditByInvoiceId", () => {
  it("agregat retur completed per faktur asal", async () => {
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue([
      { id: 21, salesInvoiceId: 2 },
      { id: 22, salesInvoiceId: 2 },
      { id: 23, salesInvoiceId: 3 },
    ])
    mocks.prismaMock.journal.findMany.mockResolvedValue([
      { referenceId: 21, entries: [{ credit: 100_000 }] },
      { referenceId: 22, entries: [{ credit: 50_000 }] },
    ])
    const map = await loadReturnCreditByInvoiceId([2, 3])
    expect(mocks.prismaMock.salesReturn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "completed", salesInvoiceId: { in: [2, 3] } }),
      }),
    )
    expect(map.get(2)).toBe(150_000)
    expect(map.has(3)).toBe(false)
  })
})

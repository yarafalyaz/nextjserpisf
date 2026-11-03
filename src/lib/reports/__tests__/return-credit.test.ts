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
    salesInvoice: { findMany: vi.fn() },
  },
  getSystemSettings: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/utils/settings", () => ({ getSystemSettings: mocks.getSystemSettings }))

import {
  loadOpenReceivablesTotal,
  loadReturnCreditByInvoiceId,
  loadReturnCreditByReturnId,
  sumOpenReceivables,
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

describe("sumOpenReceivables (putaran 84: dashboard piutang kanonis)", () => {
  it("faktur lunas murni oleh retur menyumbang 0, bukan menutupi faktur lain", () => {
    const total = sumOpenReceivables(
      [
        { id: 1, grandTotal: 10_000_000, paidAmount: 4_000_000 },
        { id: 2, grandTotal: 5_000_000, paidAmount: 0 },
      ],
      new Map([[1, 6_000_000]]),
    )
    expect(total).toBe(5_000_000)
  })

  it("tanpa retur = grandTotal - paidAmount polos", () => {
    expect(
      sumOpenReceivables([{ id: 1, grandTotal: 100, paidAmount: 30 }], new Map()),
    ).toBe(70)
  })
})

describe("loadOpenReceivablesTotal (putaran 84)", () => {
  it("memuat hanya faktur posted/partial tak terhapus lalu mengurangi returnCredit", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      { id: 1, grandTotal: 10_000_000, paidAmount: 4_000_000 },
      { id: 2, grandTotal: 5_000_000, paidAmount: 0 },
    ])
    mocks.prismaMock.salesReturn.findMany.mockResolvedValue([{ id: 21, salesInvoiceId: 1 }])
    mocks.prismaMock.journal.findMany.mockResolvedValue([
      { referenceId: 21, entries: [{ credit: 6_000_000 }] },
    ])
    await expect(loadOpenReceivablesTotal()).resolves.toBe(5_000_000)
    expect(mocks.prismaMock.salesInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ["posted", "partial"] }, deletedAt: null },
      }),
    )
  })
})

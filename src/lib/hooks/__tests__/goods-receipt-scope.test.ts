import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Putaran 76: verifikasi GR menilai ulang scope gudang atas baris TERKUNCI
 * di dalam tx hook — cek action memakai snapshot pra-tx, jadi baris GR yang
 * pindah gudang atau penugasan yang dicabut di jendela tetap terposting.
 */

const mocks = vi.hoisted(() => ({
  getWarehouseScope: vi.fn(),
  assertWarehouseAccessMulti: vi.fn(),
  transaction: vi.fn(),
  moveCreate: vi.fn(),
  grUpdate: vi.fn(),
}))

vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: (fn: (t: unknown) => Promise<unknown>) => mocks.transaction(fn) },
}))
vi.mock("@/lib/auth/warehouse-scope", () => ({
  getWarehouseScope: mocks.getWarehouseScope,
  assertWarehouseAccessMulti: mocks.assertWarehouseAccessMulti,
}))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: vi.fn().mockResolvedValue("GR-001"),
  generateDocumentNumberBatch: vi.fn().mockResolvedValue(["SM-1"]),
}))
vi.mock("@/lib/services/inventory-fifo", () => ({ createInLayer: vi.fn().mockResolvedValue(undefined) }))
vi.mock("@/lib/services/stock-journal.service", () => ({
  stockJournalService: { onGoodsReceipt: vi.fn().mockResolvedValue(undefined), onServiceGoodsReceipt: vi.fn().mockResolvedValue(undefined) },
}))

import { onGoodsReceiptVerified } from "@/lib/hooks/goods-receipt.hook"

function wireTx() {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    goodsReceipt: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({
        id: 100,
        documentNo: "GR-001",
        status: "draft",
        purchaseOrderId: null,
        warehouseId: 9,
        date: new Date("2026-05-01"),
        shippingCost: 0,
        otherCost: 0,
        adminFee: 0,
        items: [{ itemId: 7, qty: 1, unitCost: 100, warehouseId: 8, uom: null }],
        purchaseOrder: null,
      }),
      update: mocks.grUpdate,
    },
    stockMove: { findFirst: vi.fn().mockResolvedValue(null), create: mocks.moveCreate },
    systemSetting: { findFirst: vi.fn().mockResolvedValue({ periodLockDate: null }) },
    nonconformance: { count: vi.fn().mockResolvedValue(0) },
    qcInspection: { findMany: vi.fn().mockResolvedValue([]) },
  }
  mocks.transaction.mockImplementation((fn: (t: unknown) => Promise<unknown>) => fn(tx))
  return tx
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getWarehouseScope.mockResolvedValue({ kind: "assigned", warehouseIds: [9] })
})

describe("onGoodsReceiptVerified scope segar (putaran 76)", () => {
  it("scope menolak gudang baris dari bacaan terkunci: tidak ada posting stok", async () => {
    const tx = wireTx()
    mocks.assertWarehouseAccessMulti.mockImplementation(() => {
      throw new Error("Anda tidak memiliki akses ke gudang dengan ID 8.")
    })

    await expect(
      onGoodsReceiptVerified(100, 7, { id: "7", roles: ["warehouse"] }),
    ).rejects.toThrow("tidak memiliki akses")

    expect(mocks.getWarehouseScope).toHaveBeenCalledWith({ id: "7", roles: ["warehouse"] })
    expect(mocks.assertWarehouseAccessMulti).toHaveBeenCalledWith(
      { kind: "assigned", warehouseIds: [9] },
      [9, 8],
    )
    expect(tx.goodsReceipt.findUniqueOrThrow.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.getWarehouseScope.mock.invocationCallOrder[0],
    )
    expect(mocks.moveCreate).not.toHaveBeenCalled()
    expect(mocks.grUpdate).not.toHaveBeenCalled()
  })

  it("tanpa scopeUser: perilaku lama utuh (tidak menilai scope)", async () => {
    wireTx()
    mocks.moveCreate.mockResolvedValue({ id: 1 })

    await expect(onGoodsReceiptVerified(100, 7)).rejects.toThrow()

    expect(mocks.getWarehouseScope).not.toHaveBeenCalled()
  })
})

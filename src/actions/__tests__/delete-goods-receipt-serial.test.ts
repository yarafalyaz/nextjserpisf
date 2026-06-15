import { describe, it, expect, vi, beforeEach } from "vitest"
import { deleteGoodsReceipt } from "../purchase.actions"

const mocks = vi.hoisted(() => {
  const txMock: any = {
    stockMove: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
    },
    inventoryLayer: {
      deleteMany: vi.fn(),
    },
    goodsReceiptItem: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
    goodsReceipt: {
      delete: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
    purchaseOrder: {
      update: vi.fn(),
    },
    itemSerial: {
      deleteMany: vi.fn(),
    },
    $executeRaw: vi.fn(),
    journal: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  }

  const prismaMock: any = {
    goodsReceipt: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ id: 1, purchaseOrderId: 10, items: [] }),
    },
    vendorBill: {
      count: vi.fn().mockResolvedValue(0),
    },
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(txMock)
      return Promise.all(ops)
    }),
  }
  return {
    requirePermissionMock: vi.fn().mockResolvedValue({ id: 1 }),
    prismaMock,
    txMock,
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermissionMock }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))

describe("deleteGoodsReceipt with Serial Numbers", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.txMock.goodsReceiptItem.findMany.mockReset()
    mocks.txMock.itemSerial.deleteMany.mockReset()
  })

  it("should delete ItemSerial rows that the GR registered (status=available only)", async () => {
    // GoodsReceiptItem.serialNumbers stores the serials captured at verification
    mocks.txMock.goodsReceiptItem.findMany.mockResolvedValueOnce([
      { id: 1, itemId: 101, serialNumbers: ["SN-1", "SN-2"] },
    ])

    const res = await deleteGoodsReceipt(1)

    expect(res?.success).toBe(true)
    // The fix scopes the delete to available serials only — sold/used rows
    // remain as the audit trail for the downstream sales invoice.
    expect(mocks.txMock.itemSerial.deleteMany).toHaveBeenCalledTimes(1)
    expect(mocks.txMock.itemSerial.deleteMany).toHaveBeenCalledWith({
      where: { serialNumber: { in: ["SN-1", "SN-2"] }, status: "available" },
    })
  })

  it("should not call itemSerial.deleteMany when the GR has no serial items", async () => {
    mocks.txMock.goodsReceiptItem.findMany.mockResolvedValueOnce([])

    const res = await deleteGoodsReceipt(1)

    expect(res?.success).toBe(true)
    expect(mocks.txMock.itemSerial.deleteMany).not.toHaveBeenCalled()
  })

  it("should flatten serial numbers across multiple GR items", async () => {
    mocks.txMock.goodsReceiptItem.findMany.mockResolvedValueOnce([
      { id: 1, itemId: 101, serialNumbers: ["SN-A", "SN-B"] },
      { id: 2, itemId: 102, serialNumbers: ["SN-C"] },
      { id: 3, itemId: 103, serialNumbers: null },
      { id: 4, itemId: 104, serialNumbers: [] },
    ])

    const res = await deleteGoodsReceipt(1)

    expect(res?.success).toBe(true)
    expect(mocks.txMock.itemSerial.deleteMany).toHaveBeenCalledWith({
      where: { serialNumber: { in: ["SN-A", "SN-B", "SN-C"] }, status: "available" },
    })
  })

  it("should skip blank/whitespace serial entries", async () => {
    mocks.txMock.goodsReceiptItem.findMany.mockResolvedValueOnce([
      { id: 1, itemId: 101, serialNumbers: ["SN-1", "", "  ", null, "SN-2"] },
    ])

    const res = await deleteGoodsReceipt(1)

    expect(res?.success).toBe(true)
    expect(mocks.txMock.itemSerial.deleteMany).toHaveBeenCalledWith({
      where: { serialNumber: { in: ["SN-1", "SN-2"] }, status: "available" },
    })
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { createGoodsReceipt } from "../purchase.actions"

// Regression: GoodsReceiptItem.qtyOrdered must be snapshotted from the PO line
// at creation time. It used to stay at its 0 default, so the detail page's
// "Qty Dipesan" column always read 0 and a receipt looked like it had been
// ordered for nothing.
const mocks = vi.hoisted(() => {
  const prismaMock: any = {
    purchaseOrder: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    goodsReceiptItem: {
      findMany: vi.fn(),
    },
    goodsReceipt: {
      create: vi.fn().mockResolvedValue({ id: 99, purchaseOrderId: 1 }),
    },
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
  }
  return {
    requirePermissionMock: vi.fn().mockResolvedValue({ id: 1 }),
    prismaMock,
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermissionMock }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("GR-123") }))

describe("GoodsReceipt qtyOrdered snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.goodsReceipt.create.mockResolvedValue({ id: 99, purchaseOrderId: 1 })
  })

  it("stores the PO ordered qty on each GR line", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "approved",
      items: [{ itemId: 3, qty: 1 }],
    })
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([])

    const items = JSON.stringify([{ itemId: 3, qty: 1, unitCost: 15000000 }])
    const f = new FormData()
    f.append("purchaseOrderId", "1")
    f.append("date", "2024-01-01")
    f.append("warehouseId", "5")
    f.append("items", items)

    const res = await createGoodsReceipt(f)
    expect(res.success).toBe(true)

    const createArg = mocks.prismaMock.goodsReceipt.create.mock.calls[0][0]
    const createdItem = createArg.data.items.create[0]
    expect(createdItem.itemId).toBe(3)
    expect(Number(createdItem.qtyOrdered)).toBe(1)
    expect(Number(createdItem.qty)).toBe(1)
  })
})

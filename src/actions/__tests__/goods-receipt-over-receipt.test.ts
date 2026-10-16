import { describe, it, expect, vi } from "vitest"
import { createGoodsReceipt } from "../purchase.actions"

// Use same mocks as the main test suite
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
    // roles super_admin → scope gudang "all" (scope-nya sendiri diuji di
    // purchase.actions.test.ts), sehingga tes ini fokus ke guard over-receipt.
    requirePermissionMock: vi.fn().mockResolvedValue({ id: 1, roles: ["super_admin"] }),
    prismaMock,
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermissionMock }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("GR-123") }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))

describe("GoodsReceipt Over-receipt Guard", () => {
  it("accepts the draft for duplicate item IDs (over-receipt is capped at verification)", async () => {
    // The over-receive cap is enforced at VERIFICATION in the goods-receipt hook,
    // which converts every row to the item's BASE unit before comparing against
    // the PO qty. GoodsReceiptItem.qty is stored in the ENTERED UoM, so a
    // create-time comparison against the base-unit PO qty is apples-to-oranges
    // and would wrongly reject valid receipts. The draft must therefore be created.
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "approved",
      items: [{ itemId: 101, qty: 10 }],
    })
    mocks.prismaMock.goodsReceipt.create.mockResolvedValue({ id: 99, purchaseOrderId: 1 })

    // Payload: two lines for item 101, qty 6 and qty 5 (total 11 > 10)
    const items = JSON.stringify([
      { itemId: 101, qty: 6, unitCost: 100 },
      { itemId: 101, qty: 5, unitCost: 100 },
    ])

    const f = new FormData()
    f.append("purchaseOrderId", "1")
    f.append("date", "2024-01-01")
    f.append("warehouseId", "1")
    f.append("items", items)

    const res = await createGoodsReceipt(f)

    expect(res.success).toBe(true)
  })

  it("still rejects an item that is not part of the purchase order", async () => {
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "approved",
      items: [{ itemId: 101, qty: 10 }],
    })
    mocks.prismaMock.goodsReceipt.create.mockResolvedValue({ id: 99, purchaseOrderId: 1 })

    const items = JSON.stringify([{ itemId: 999, qty: 1, unitCost: 100 }])
    const f = new FormData()
    f.append("purchaseOrderId", "1")
    f.append("date", "2024-01-01")
    f.append("warehouseId", "1")
    f.append("items", items)

    const res = await createGoodsReceipt(f)

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/tidak ada dalam pesanan/i)
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"
import { createGoodsReceipt } from "../purchase.actions"
import { parseFormData } from "@/lib/validations/parse-form"

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
    requirePermissionMock: vi.fn().mockResolvedValue({ id: 1 }),
    prismaMock,
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermissionMock }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("GR-123") }))

describe("GoodsReceipt Over-receipt Guard", () => {
  it("rejects over-receipt when duplicate item IDs exist in the same payload", async () => {
    // Mock PO: 1 item, ordered qty 10
    mocks.prismaMock.purchaseOrder.findUniqueOrThrow.mockResolvedValue({
      id: 1,
      status: "approved",
      items: [{ itemId: 101, qty: 10 }],
    })
    
    // Prior receipts: none
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([])

    // Payload: submit two lines for item 101, qty 6 and qty 5 (total 11 > 10)
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
    
    // We expect it to fail with an error about exceeding the ordered amount
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/melebihi pesanan/i)
  })
})

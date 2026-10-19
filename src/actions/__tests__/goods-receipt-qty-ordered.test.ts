import { describe, it, expect, vi, beforeEach } from "vitest"
import { createGoodsReceipt } from "../purchase.actions"
import {
  goodsReceiptForm,
  mockApprovedPo,
  mockGrCreate,
} from "./goods-receipt-test-utils"

// Regression: GoodsReceiptItem.qtyOrdered must be snapshotted from the PO line
// at creation time. It used to stay at its 0 default, so the detail page's
// "Qty Dipesan" column always read 0 and a receipt looked like it had been
// ordered for nothing.
const mocks = await vi.hoisted(async () => (await import("./goods-receipt-test-utils")).createGoodsReceiptMocks())

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermissionMock }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("GR-123") }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))

describe("GoodsReceipt qtyOrdered snapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGrCreate(mocks)
  })

  it("stores the PO ordered qty on each GR line", async () => {
    mockApprovedPo(mocks, [{ itemId: 3, qty: 1 }])
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([])

    const res = await createGoodsReceipt(
      goodsReceiptForm([{ itemId: 3, qty: 1, unitCost: 15000000 }], { date: "2024-01-01" }),
    )
    expect(res.success).toBe(true)

    const createArg = mocks.prismaMock.goodsReceipt.create.mock.calls[0][0]
    const createdItem = createArg.data.items.create[0]
    expect(createdItem.itemId).toBe(3)
    expect(Number(createdItem.qtyOrdered)).toBe(1)
    expect(Number(createdItem.qty)).toBe(1)
  })
})

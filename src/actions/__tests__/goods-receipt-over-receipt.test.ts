import { describe, it, expect, vi } from "vitest"
import { createGoodsReceipt } from "../purchase.actions"
import {
  goodsReceiptForm,
  mockApprovedPo,
  mockGrCreate,
} from "./goods-receipt-test-utils"

const mocks = await vi.hoisted(async () => (await import("./goods-receipt-test-utils")).createGoodsReceiptMocks())

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
    mockApprovedPo(mocks, [{ itemId: 101, qty: 10 }])
    mockGrCreate(mocks)

    // Payload: two lines for item 101, qty 6 and qty 5 (total 11 > 10)
    const f = goodsReceiptForm(
      [
        { itemId: 101, qty: 6, unitCost: 100 },
        { itemId: 101, qty: 5, unitCost: 100 },
      ],
      { date: "2024-01-01", warehouseId: "1" },
    )

    const res = await createGoodsReceipt(f)

    expect(res.success).toBe(true)
  })

  it("still rejects an item that is not part of the purchase order", async () => {
    mockApprovedPo(mocks, [{ itemId: 101, qty: 10 }])
    mockGrCreate(mocks)

    const f = goodsReceiptForm([{ itemId: 999, qty: 1, unitCost: 100 }], {
      date: "2024-01-01",
      warehouseId: "1",
    })

    const res = await createGoodsReceipt(f)

    expect(res.success).toBe(false)
    expect(res.error).toMatch(/tidak ada dalam pesanan/i)
  })
})

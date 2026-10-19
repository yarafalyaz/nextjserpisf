import { describe, it, expect, vi, beforeEach } from "vitest"
import { createGoodsReceipt, updateGoodsReceipt } from "../purchase.actions"
import {
  goodsReceiptForm,
  mockApprovedPo,
  mockGrCreate,
} from "./goods-receipt-test-utils"

// Regression: GoodsReceiptItem.expiryDate inside the items JSON bypassed the
// dateOnly calendar validation used for the header date. A fictitious
// "2026-02-30" was silently rolled by `new Date(...)` to 2026-03-02 and a
// garbage string became Invalid Date written toward Prisma.
const mocks = await vi.hoisted(async () => (await import("./goods-receipt-test-utils")).createGoodsReceiptMocks())

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: mocks.requirePermissionMock }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("GR-123") }))
vi.mock("@/lib/utils/slug-db", () => ({ nextSlug: vi.fn(async () => "test-slug") }))

const grForm = (expiryDate: string | null) =>
  goodsReceiptForm([{ itemId: 3, qty: 1, unitCost: 1500, ...(expiryDate === null ? {} : { expiryDate }) }])

describe("GoodsReceipt expiryDate calendar validation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGrCreate(mocks)
    mocks.prismaMock.goodsReceipt.update.mockResolvedValue({ id: 99, purchaseOrderId: 1, documentNo: "GR-123" })
    mocks.prismaMock.goodsReceipt.findUniqueOrThrow.mockResolvedValue({ id: 99, status: "draft", documentNo: "GR-123" })
    mocks.prismaMock.goodsReceipt.findUnique.mockResolvedValue({ status: "draft" })
    mockApprovedPo(mocks, [{ itemId: 3, qty: 10 }])
    mocks.prismaMock.goodsReceiptItem.findMany.mockResolvedValue([])
  })

  it("rejects fictitious expiry 2026-02-30 on create without writing", async () => {
    const res = await createGoodsReceipt(grForm("2026-02-30"))
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.goodsReceipt.create).not.toHaveBeenCalled()
  })

  it("rejects garbage expiry string on create without writing", async () => {
    const res = await createGoodsReceipt(grForm("bukan-tanggal"))
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.goodsReceipt.create).not.toHaveBeenCalled()
  })

  it("stores valid expiry as UTC midnight on create", async () => {
    const res = await createGoodsReceipt(grForm("2026-02-28"))
    expect(res.success).toBe(true)
    const created = mocks.prismaMock.goodsReceipt.create.mock.calls[0][0].data.items.create[0]
    expect(created.expiryDate).toEqual(new Date(Date.UTC(2026, 1, 28)))
  })

  it("rejects fictitious expiry 2026-04-31 on update without writing", async () => {
    const res = await updateGoodsReceipt(99, grForm("2026-04-31"))
    expect(res.success).toBe(false)
    expect(mocks.prismaMock.goodsReceiptItem.createMany).not.toHaveBeenCalled()
  })
})

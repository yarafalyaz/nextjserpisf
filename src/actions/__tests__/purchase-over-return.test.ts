import { describe, it, expect, vi, beforeEach } from "vitest"
import { updatePurchaseReturn } from "../purchase.actions"

// We mock findOverReturn to return a violation, testing that updatePurchaseReturn correctly stops and returns the error.
vi.mock("@/lib/sales/return-validation", () => ({
  findOverReturn: vi.fn().mockReturnValue({
    itemId: 1,
    type: "exceeds_invoiced",
    requested: 10,
    invoiced: 5,
    alreadyReturned: 0,
    remaining: 5,
  }),
}))

const mocks = vi.hoisted(() => {
  const prismaMock: any = {
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return ops
    }),
    purchaseReturn: {
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({ id: 1 }),
    },
    goodsReceiptItem: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    purchaseReturnItem: {
      findMany: vi.fn().mockResolvedValue([]),
      deleteMany: vi.fn(),
    },
    item: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  }
  return { prismaMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn().mockResolvedValue({ id: 1 }) }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: vi.fn() }))

function fdMap(obj: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(obj)) fd.append(k, v)
  return fd
}

describe("Purchase Return Actions - Over Return", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("updatePurchaseReturn fails if findOverReturn detects an over-return violation", async () => {
    mocks.prismaMock.purchaseReturn.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
    mocks.prismaMock.purchaseReturn.findUnique.mockResolvedValue({ id: 1, status: "draft" })

    const res = await updatePurchaseReturn(1, fdMap({
      purchaseOrderId: "1",
      date: "2026-06-12",
      items: JSON.stringify([{ itemId: 1, qty: 10 }])
    }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("Jumlah retur item #1 melebihi yang diterima")
  })
})

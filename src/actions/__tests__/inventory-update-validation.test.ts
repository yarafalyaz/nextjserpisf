import { describe, it, expect, vi, beforeEach } from "vitest"

const mocks = vi.hoisted(() => {
  const buildModelMock = () => ({
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn(),
  })

  const prismaMock: any = {
    stockAdjustment: buildModelMock(),
    materialIssue: buildModelMock(),
    stockMove: {
      groupBy: vi.fn().mockResolvedValue([]),
    },
    $transaction: vi.fn(async (ops: any) => {
      if (typeof ops === "function") return ops(prismaMock)
      return Promise.all(ops)
    }),
  }

  return {
    requirePermissionMock: vi.fn(),
    prismaMock,
    revalidateMock: vi.fn(),
    logActivityMock: vi.fn(),
  }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: (...a: any) => mocks.requirePermissionMock(...a) }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidateMock }))
vi.mock("@/lib/services/activity-log.service", () => ({ logActivity: mocks.logActivityMock }))
vi.mock("@/lib/utils/document-number", () => ({ generateDocumentNumber: vi.fn().mockResolvedValue("DOC-001") }))

import * as actions from "../inventory.actions"

function fdMap(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) {
    if (v !== null && v !== undefined) f.append(k, String(v))
  }
  return f
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requirePermissionMock.mockResolvedValue({ id: 1 })
})

describe("Inventory Update Actions - Zod Validation Guards", () => {
  describe("updateStockAdjustment", () => {
    it("fails and returns error when warehouseId is missing/0", async () => {
      mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
      const res = await actions.updateStockAdjustment(
        1,
        fdMap({
          warehouseId: 0,
          date: "2026-06-16",
          items: JSON.stringify([{ itemId: 1, newQty: 10 }]),
        })
      )
      expect(res.success).toBe(false)
      expect(res.error).toContain("Gudang wajib dipilih")
      expect(mocks.prismaMock.stockAdjustment.update).not.toHaveBeenCalled()
    })

    it("fails and returns error when date is empty", async () => {
      mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
      const res = await actions.updateStockAdjustment(
        1,
        fdMap({
          warehouseId: 1,
          date: "",
          items: JSON.stringify([{ itemId: 1, newQty: 10 }]),
        })
      )
      expect(res.success).toBe(false)
      expect(res.error).toBeTypeOf("string")
      expect(mocks.prismaMock.stockAdjustment.update).not.toHaveBeenCalled()
    })

    it("fails and returns error when notes is too long", async () => {
      mocks.prismaMock.stockAdjustment.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
      const res = await actions.updateStockAdjustment(
        1,
        fdMap({
          warehouseId: 1,
          date: "2026-06-16",
          notes: "A".repeat(1001),
          items: JSON.stringify([{ itemId: 1, newQty: 10 }]),
        })
      )
      expect(res.success).toBe(false)
      expect(res.error).toContain("notes")
      expect(mocks.prismaMock.stockAdjustment.update).not.toHaveBeenCalled()
    })
  })

  describe("updateMaterialIssue", () => {
    it("fails and returns error when warehouseId is missing/0", async () => {
      mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
      const res = await actions.updateMaterialIssue(
        1,
        fdMap({
          warehouseId: 0,
          date: "2026-06-16",
          items: JSON.stringify([{ itemId: 1, qty: 10 }]),
        })
      )
      expect(res.success).toBe(false)
      expect(res.error).toContain("Gudang wajib dipilih")
      expect(mocks.prismaMock.materialIssue.update).not.toHaveBeenCalled()
    })

    it("fails and returns error when date is empty", async () => {
      mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
      const res = await actions.updateMaterialIssue(
        1,
        fdMap({
          warehouseId: 1,
          date: "",
          items: JSON.stringify([{ itemId: 1, qty: 10 }]),
        })
      )
      expect(res.success).toBe(false)
      expect(res.error).toBeTypeOf("string")
      expect(mocks.prismaMock.materialIssue.update).not.toHaveBeenCalled()
    })

    it("fails and returns error when notes is too long", async () => {
      mocks.prismaMock.materialIssue.findUniqueOrThrow.mockResolvedValue({ id: 1, status: "draft" })
      const res = await actions.updateMaterialIssue(
        1,
        fdMap({
          warehouseId: 1,
          date: "2026-06-16",
          notes: "A".repeat(1001),
          items: JSON.stringify([{ itemId: 1, qty: 10 }]),
        })
      )
      expect(res.success).toBe(false)
      expect(res.error).toContain("notes")
      expect(mocks.prismaMock.materialIssue.update).not.toHaveBeenCalled()
    })
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"

// Regression tests for BOM revisions (PRD FAB-02 / MOD-04).
//
// 1. createProductionOrder must PIN the effective BOM revision and snapshot its
//    lines, so later edits to the master BOM cannot change an order's basis.
// 2. releaseBomRevision must supersede the previously released revision and must
//    refuse an empty revision.
// 3. deleteBomRevision must be limited to drafts and refuse revisions already
//    referenced by orders.
// 4. updateBomRevision must refuse to edit a non-draft revision.

const requirePermissionMock = vi.fn()
const revalidateMock = vi.fn()
const logActivityMock = vi.fn()

const productFindUniqueOrThrowMock = vi.fn()
const itemFindManyMock = vi.fn()
const productionOrderCreateMock = vi.fn()
const productMaterialFindManyMock = vi.fn()
const bomRevisionFindFirstMock = vi.fn()
const bomRevisionCreateMock = vi.fn()
const bomRevisionFindUniqueMock = vi.fn()
const bomRevisionUpdateMock = vi.fn()
const bomRevisionUpdateManyMock = vi.fn()
const bomRevisionDeleteMock = vi.fn()

const generateDocumentNumberMock = vi.fn()

vi.mock("@/lib/auth/permissions", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}))
vi.mock("@/lib/services/activity-log.service", () => ({
  logActivity: (...a: unknown[]) => logActivityMock(...a),
}))
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidateMock(...a) }))
vi.mock("@/lib/utils/document-number", () => ({
  generateDocumentNumber: (...a: unknown[]) => generateDocumentNumberMock(...a),
  generateDocumentNumberBatch: vi.fn().mockResolvedValue([]),
}))

vi.mock("@/lib/db/prisma", () => {
  const prisma: Record<string, unknown> = {
    product: { findUniqueOrThrow: (...a: unknown[]) => productFindUniqueOrThrowMock(...a) },
    item: { findMany: (...a: unknown[]) => itemFindManyMock(...a) },
    productionOrder: { create: (...a: unknown[]) => productionOrderCreateMock(...a) },
    productMaterial: { findMany: (...a: unknown[]) => productMaterialFindManyMock(...a) },
    bomRevision: {
      findFirst: (...a: unknown[]) => bomRevisionFindFirstMock(...a),
      findUnique: (...a: unknown[]) => bomRevisionFindUniqueMock(...a),
      create: (...a: unknown[]) => bomRevisionCreateMock(...a),
      update: (...a: unknown[]) => bomRevisionUpdateMock(...a),
      updateMany: (...a: unknown[]) => bomRevisionUpdateManyMock(...a),
      delete: (...a: unknown[]) => bomRevisionDeleteMock(...a),
    },
  }
  prisma.$transaction = vi.fn((cb: unknown) =>
    typeof cb === "function" ? (cb as (tx: unknown) => unknown)(prisma) : Promise.all(cb as unknown[]),
  )
  return { prisma }
})

import {
  createProductionOrder,
  createBomRevision,
  releaseBomRevision,
  deleteBomRevision,
  updateBomRevision,
} from "../manufacturing.actions"

function fd(payload: Record<string, string | number | null | undefined>): FormData {
  const f = new FormData()
  for (const [k, v] of Object.entries(payload)) if (v != null) f.append(k, String(v))
  return f
}

beforeEach(() => {
  for (const m of [
    requirePermissionMock, revalidateMock, logActivityMock,
    productFindUniqueOrThrowMock, itemFindManyMock, productionOrderCreateMock,
    productMaterialFindManyMock, bomRevisionFindFirstMock, bomRevisionCreateMock,
    bomRevisionFindUniqueMock, bomRevisionUpdateMock, bomRevisionUpdateManyMock,
    bomRevisionDeleteMock, generateDocumentNumberMock,
  ]) m.mockReset()

  requirePermissionMock.mockResolvedValue({ id: 5 })
  generateDocumentNumberMock.mockResolvedValue("MO-0001")
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("createProductionOrder — BOM revision pinning", () => {
  it("pins the released revision and snapshots its frozen lines", async () => {
    productFindUniqueOrThrowMock.mockResolvedValue({ id: 9, standardCost: 0 })
    // Released revision exists → resolveEffectiveBom returns it.
    bomRevisionFindFirstMock.mockResolvedValue({
      id: 42, revisionNo: 2,
      materials: [{ itemId: 1, qty: 2 }, { itemId: 2, qty: 3 }],
    })
    itemFindManyMock.mockResolvedValue([
      { id: 1, standardCost: 10 },
      { id: 2, standardCost: 5 },
    ])
    productionOrderCreateMock.mockResolvedValue({ id: 100 })

    const res = await createProductionOrder(fd({ productId: 9, qty: 4 }))

    expect(res.success).toBe(true)
    const arg = productionOrderCreateMock.mock.calls[0][0]
    expect(arg.data.bomRevisionId).toBe(42)
    // frozen lines × order qty
    expect(arg.data.materials.create).toEqual([
      { itemId: 1, qty: 8, standardCost: 10 },
      { itemId: 2, qty: 12, standardCost: 5 },
    ])
    // Working BOM must NOT be read when a released revision exists.
    expect(productMaterialFindManyMock).not.toHaveBeenCalled()
  })

  it("falls back to the working BOM with bomRevisionId=null when none released", async () => {
    productFindUniqueOrThrowMock.mockResolvedValue({ id: 9, standardCost: 0 })
    bomRevisionFindFirstMock.mockResolvedValue(null)
    productMaterialFindManyMock.mockResolvedValue([{ itemId: 7, qty: 1.5 }])
    itemFindManyMock.mockResolvedValue([{ id: 7, standardCost: 4 }])
    productionOrderCreateMock.mockResolvedValue({ id: 101 })

    const res = await createProductionOrder(fd({ productId: 9, qty: 2 }))

    expect(res.success).toBe(true)
    const arg = productionOrderCreateMock.mock.calls[0][0]
    expect(arg.data.bomRevisionId).toBeNull()
    expect(arg.data.materials.create).toEqual([{ itemId: 7, qty: 3, standardCost: 4 }])
  })
})

describe("createBomRevision", () => {
  it("snapshots the working BOM and assigns the next revision number", async () => {
    productFindUniqueOrThrowMock.mockResolvedValue({
      id: 9, materials: [{ itemId: 1, qty: 2 }, { itemId: 3, qty: 1 }],
    })
    bomRevisionFindFirstMock.mockResolvedValue({ revisionNo: 4 })
    bomRevisionCreateMock.mockResolvedValue({ id: 77, revisionNo: 5 })

    const res = await createBomRevision(fd({ productId: 9, effectiveDate: "2026-10-08" }))

    expect(res.success).toBe(true)
    const arg = bomRevisionCreateMock.mock.calls[0][0]
    expect(arg.data.revisionNo).toBe(5)
    expect(arg.data.status).toBe("draft")
    expect(arg.data.materials.create).toEqual([
      { itemId: 1, qty: 2 },
      { itemId: 3, qty: 1 },
    ])
  })
})

describe("releaseBomRevision", () => {
  it("refuses to release an empty revision", async () => {
    bomRevisionFindUniqueMock.mockResolvedValue({ id: 1, revisionNo: 1, productId: 9, materials: [] })

    const res = await releaseBomRevision(1)

    expect(res.success).toBe(false)
    expect(res.error).toContain("kosong")
    expect(bomRevisionUpdateManyMock).not.toHaveBeenCalled()
  })

  it("releases a draft and supersedes the previously released revision", async () => {
    bomRevisionFindUniqueMock.mockResolvedValue({
      id: 1, revisionNo: 2, productId: 9, materials: [{ itemId: 1, qty: 1 }],
    })
    bomRevisionUpdateManyMock
      .mockResolvedValueOnce({ count: 1 }) // single atomic claim for this id
      .mockResolvedValueOnce({ count: 1 }) // supersede the other released one

    const res = await releaseBomRevision(1)

    expect(res.success).toBe(true)
    const claim = bomRevisionUpdateManyMock.mock.calls[0][0]
    expect(claim.where).toEqual({ id: 1, status: "draft" })
    expect(claim.data.status).toBe("released")
    const supersede = bomRevisionUpdateManyMock.mock.calls[1][0]
    expect(supersede.where).toEqual({ productId: 9, status: "released", id: { not: 1 } })
    expect(supersede.data.status).toBe("superseded")
  })

  it("fails when the atomic draft claim is lost (non-draft)", async () => {
    bomRevisionFindUniqueMock.mockResolvedValue({
      id: 1, revisionNo: 2, productId: 9, materials: [{ itemId: 1, qty: 1 }],
    })
    bomRevisionUpdateManyMock.mockResolvedValueOnce({ count: 0 })

    const res = await releaseBomRevision(1)

    expect(res.success).toBe(false)
    // must not supersede anything when the claim was lost
    expect(bomRevisionUpdateManyMock).toHaveBeenCalledTimes(1)
  })
})

describe("deleteBomRevision", () => {
  it("refuses to delete a non-draft revision", async () => {
    bomRevisionFindUniqueMock.mockResolvedValue({
      id: 1, status: "released", productId: 9,
      _count: { productionOrders: 0, workOrders: 0 },
    })

    const res = await deleteBomRevision(1)

    expect(res.success).toBe(false)
    expect(bomRevisionDeleteMock).not.toHaveBeenCalled()
  })

  it("refuses to delete a draft already pinned by an order", async () => {
    bomRevisionFindUniqueMock.mockResolvedValue({
      id: 1, status: "draft", productId: 9,
      _count: { productionOrders: 2, workOrders: 0 },
    })

    const res = await deleteBomRevision(1)

    expect(res.success).toBe(false)
    expect(res.error).toContain("dipakai")
    expect(bomRevisionDeleteMock).not.toHaveBeenCalled()
  })

  it("deletes an unused draft", async () => {
    bomRevisionFindUniqueMock.mockResolvedValue({
      id: 1, status: "draft", productId: 9,
      _count: { productionOrders: 0, workOrders: 0 },
    })
    bomRevisionDeleteMock.mockResolvedValue({})

    const res = await deleteBomRevision(1)

    expect(res.success).toBe(true)
    expect(bomRevisionDeleteMock).toHaveBeenCalledWith({ where: { id: 1 } })
  })
})

describe("updateBomRevision", () => {
  it("refuses to edit a released revision", async () => {
    bomRevisionFindUniqueMock.mockResolvedValue({ id: 1, status: "released", productId: 9 })

    const res = await updateBomRevision(1, fd({ effectiveDate: "2026-10-09" }))

    expect(res.success).toBe(false)
    expect(res.error).toContain("tidak dapat diubah")
    expect(bomRevisionUpdateMock).not.toHaveBeenCalled()
  })

  it("replaces the lines of a draft revision", async () => {
    bomRevisionFindUniqueMock.mockResolvedValue({ id: 1, status: "draft", productId: 9 })
    bomRevisionUpdateMock.mockResolvedValue({})
    const form = fd({ effectiveDate: "2026-10-09" })
    form.append("revisionItemId", "1")
    form.append("revisionQty", "2")
    form.append("revisionItemId", "3")
    form.append("revisionQty", "5")

    const res = await updateBomRevision(1, form)

    expect(res.success).toBe(true)
    const arg = bomRevisionUpdateMock.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 1 })
    expect(arg.data.materials.create).toEqual([
      { itemId: 1, qty: 2 },
      { itemId: 3, qty: 5 },
    ])
  })
})

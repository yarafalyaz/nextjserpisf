import { describe, it, expect, vi, beforeEach } from "vitest"

// Tests for resolveEffectiveBom: the snapshot-resolution used by
// createProductionOrder (PRD FAB-02). It must prefer the latest RELEASED
// revision, and fall back to the working BOM (revisionId = null) when the
// product has no released revision yet — otherwise products without revisions
// would silently produce empty orders.

const bomRevisionFindFirstMock = vi.fn()
const productMaterialFindManyMock = vi.fn()

const client = {
  bomRevision: { findFirst: (...a: unknown[]) => bomRevisionFindFirstMock(...a) },
  productMaterial: { findMany: (...a: unknown[]) => productMaterialFindManyMock(...a) },
}

import { resolveEffectiveBom } from "@/lib/services/bom-revision.service"

beforeEach(() => {
  bomRevisionFindFirstMock.mockReset()
  productMaterialFindManyMock.mockReset()
})

describe("resolveEffectiveBom", () => {
  it("uses the latest released revision and its frozen lines", async () => {
    bomRevisionFindFirstMock.mockResolvedValue({
      id: 42,
      revisionNo: 3,
      materials: [
        { itemId: 1, qty: 2 },
        { itemId: 2, qty: 4.5 },
      ],
    })

    const bom = await resolveEffectiveBom(9, client as never)

    expect(bom.revisionId).toBe(42)
    expect(bom.revisionNo).toBe(3)
    expect(bom.lines).toEqual([
      { itemId: 1, qtyPerUnit: 2 },
      { itemId: 2, qtyPerUnit: 4.5 },
    ])
    // The query must explicitly ask for the released revision, newest first.
    const arg = bomRevisionFindFirstMock.mock.calls[0][0]
    expect(arg.where).toEqual({ productId: 9, status: "released" })
    expect(arg.orderBy).toEqual({ revisionNo: "desc" })
    // Working BOM must not be touched when a released revision exists.
    expect(productMaterialFindManyMock).not.toHaveBeenCalled()
  })

  it("falls back to the working BOM with revisionId=null when none released", async () => {
    bomRevisionFindFirstMock.mockResolvedValue(null)
    productMaterialFindManyMock.mockResolvedValue([
      { itemId: 5, qty: 1 },
      { itemId: 6, qty: 3 },
    ])

    const bom = await resolveEffectiveBom(9, client as never)

    expect(bom.revisionId).toBeNull()
    expect(bom.revisionNo).toBeNull()
    expect(bom.lines).toEqual([
      { itemId: 5, qtyPerUnit: 1 },
      { itemId: 6, qtyPerUnit: 3 },
    ])
    expect(productMaterialFindManyMock).toHaveBeenCalledWith({
      where: { productId: 9 },
      select: { itemId: true, qty: true },
    })
  })

  it("returns an empty line set when neither a revision nor working BOM exist", async () => {
    bomRevisionFindFirstMock.mockResolvedValue(null)
    productMaterialFindManyMock.mockResolvedValue([])

    const bom = await resolveEffectiveBom(9, client as never)

    expect(bom.revisionId).toBeNull()
    expect(bom.lines).toEqual([])
  })
})

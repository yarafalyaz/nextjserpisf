import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * BUGHUNT round3 #11 (sibling): loader delta PO dulu men-select
 * `ProductionOrderMaterial.issuedQty` — bukan kolom (field-nya `actualQty`,
 * schema.prisma:3151) — sehingga pratinjau delta PO juga mati di runtime.
 * Mock `vi.fn()` menerima select apa pun, jadi bentuk select diasertasi persis
 * di sini dan konstanta bertipe Prisma-nya dikunci (salah-nama gagal di tsc).
 */

const mocks = vi.hoisted(() => {
  const prismaMock = {
    productionOrder: { findFirst: vi.fn() },
    workOrder: { findFirst: vi.fn() },
    bomRevision: { findFirst: vi.fn() },
    materialIssueItem: { findMany: vi.fn() },
    item: { findMany: vi.fn() },
  }
  return { prismaMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import {
  loadBomRevisionChangeDelta,
  PO_MATERIAL_ACTUAL_SELECT,
} from "../bom-revision-change-delta-data"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.productionOrder.findFirst.mockResolvedValue({
    documentNo: "PO-0011",
    bomRevisionId: 100,
    qty: 10,
    materials: [{ itemId: 5, actualQty: 7 }],
  })
  mocks.prismaMock.bomRevision.findFirst
    .mockResolvedValueOnce({ materials: [{ itemId: 5, qty: 1 }] })
    .mockResolvedValueOnce({ materials: [{ itemId: 5, qty: 2 }] })
  mocks.prismaMock.item.findMany.mockResolvedValue([{ id: 5, qtyOnHand: 100 }])
})

describe("loadBomRevisionChangeDelta (PO)", () => {
  it("select material memakai actualQty, bukan issuedQty", async () => {
    expect(PO_MATERIAL_ACTUAL_SELECT).toEqual({ itemId: true, actualQty: true })
    expect(PO_MATERIAL_ACTUAL_SELECT).not.toHaveProperty("issuedQty")

    const delta = await loadBomRevisionChangeDelta({ productionOrderId: 11, toRevisionId: 101 })

    expect(delta).not.toBeNull()
    const call = mocks.prismaMock.productionOrder.findFirst.mock.calls[0][0]
    expect(call.select.materials).toEqual({ select: { itemId: true, actualQty: true } })
    expect(call.select.materials.select).not.toHaveProperty("issuedQty")
    // actualQty 7 mengalir ke builder sebagai issued per item.
    expect(delta!.lines.find((l) => l.itemId === 5)?.issuedQty).toBe(7)
  })

  it("actualQty null terbaca 0 (belum ter-issue), bukan NaN", async () => {
    mocks.prismaMock.productionOrder.findFirst.mockResolvedValue({
      documentNo: "PO-0011",
      bomRevisionId: 100,
      qty: 10,
      materials: [{ itemId: 5, actualQty: null }],
    })

    const delta = await loadBomRevisionChangeDelta({ productionOrderId: 11, toRevisionId: 101 })

    expect(delta!.lines.find((l) => l.itemId === 5)?.issuedQty).toBe(0)
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Kebutuhan material per WO (F-2026-10-20-19). Yang dijaga: MI
 * non-completed tidak mengurangi sisa (stok belum keluar), PO cancelled
 * tidak terhitung dipesan, baris `replaced` tidak terhitung butuh, dan
 * builder menghitung sisa/kekurangan dengan benar.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    workOrder: { findUnique: vi.fn() },
    item: { findMany: vi.fn() },
    materialIssue: { findMany: vi.fn() },
    purchaseOrder: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getWorkOrderMaterialNeeds } from "../work-order-material-needs-data"
import { buildWorkOrderMaterialNeeds } from "../work-order-material-needs"

function woWith(items: Record<string, unknown>[]) {
  return { id: 9, items }
}
function baseMocks() {
  mocks.prismaMock.workOrder.findUnique.mockResolvedValue(
    woWith([
      { itemId: 1, description: null, qty: 10, status: "pending" },
      { itemId: 2, description: null, qty: 4, status: "replaced" },
      { itemId: 0, description: "Jasa las", qty: 1, status: "pending" },
    ]),
  )
  mocks.prismaMock.item.findMany.mockResolvedValue([
    { id: 1, name: "Plat 3mm", unitOfMeasure: "LBR", qtyOnHand: 3 },
  ])
  mocks.prismaMock.materialIssue.findMany.mockResolvedValue([
    { items: [{ itemId: 1, qty: 6 }] },
  ])
  mocks.prismaMock.purchaseOrder.findMany.mockResolvedValue([
    { items: [{ itemId: 1, qty: 10, receivedQty: 2 }] },
  ])
}

beforeEach(() => {
  vi.clearAllMocks()
  baseMocks()
})

describe("getWorkOrderMaterialNeeds", () => {
  it("query MI hanya status completed dan PO tanpa cancelled", async () => {
    const r = await getWorkOrderMaterialNeeds(9)
    expect(mocks.prismaMock.materialIssue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workOrderId: 9, status: "completed" } }),
    )
    expect(mocks.prismaMock.purchaseOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { notIn: ["cancelled"] } }),
      }),
    )
    // Baris replaced (item 2) tidak muncul; baris jasa terpenuhi.
    expect(r?.lines.map((l) => l.itemId)).toEqual([1, 0])
    const plat = r?.lines[0]
    expect(plat).toMatchObject({
      requiredQty: 10, issuedQty: 6, orderedQty: 8,
      remainingQty: 4, qtyOnHand: 3, shortageQty: 1, fulfilled: false,
    })
    expect(r?.lines[1]).toMatchObject({ isService: true, fulfilled: true })
    expect(r?.shortageCount).toBe(1)
  })

  it("WO tidak ditemukan -> null", async () => {
    mocks.prismaMock.workOrder.findUnique.mockResolvedValue(null)
    expect(await getWorkOrderMaterialNeeds(404)).toBeNull()
  })

  it("MI non-completed tidak mengurangi sisa (falsifikasi jalur status)", async () => {
    // Ganti query menjadi semua status: sisa harus tetap dihitung hanya
    // dari baris yang mock kembalikan; bila loader melonggarkan status,
    // tes di atas (filter completed) merah. Di sini verifikasi perilaku
    // builder terhadap issuedQty yang loader suplai.
    mocks.prismaMock.materialIssue.findMany.mockResolvedValue([
      { items: [{ itemId: 1, qty: 6 }] },
      { items: [{ itemId: 1, qty: 4 }] },
    ])
    const r = await getWorkOrderMaterialNeeds(9)
    expect(r?.lines[0]).toMatchObject({ issuedQty: 10, remainingQty: 0, fulfilled: true, shortageQty: 0 })
  })
})

describe("buildWorkOrderMaterialNeeds", () => {
  it("kekurangan = sisa - stok, terpenuhi bila issued >= butuh", () => {
    const r = buildWorkOrderMaterialNeeds([
      { itemId: 5, name: "Besi", unitOfMeasure: "BTG", requiredQty: 10, qtyOnHand: 99, issuedQty: 10, orderedQty: 0 },
    ])
    expect(r.allFulfilled).toBe(true)
    expect(r.lines[0].shortageQty).toBe(0)
    expect(r.totalRequired).toBe(10)
  })
})

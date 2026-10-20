import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * F-2026-10-20-51(a)+52: stok terikat WO lain (ATP read-only) + incoming
 * bertanggal. Yang dijaga:
 * - committedOther = sisa kebutuhan (required−issued) WO aktif LAIN per item;
 *   stok sama tidak dijanjikan dua kali.
 * - tersediaEfektif = qtyOnHand − committedOtherQty; shortageEfektif dihitung
 *   dari tersediaEfektif.
 * - incoming = PO non-cancelled WO ini, sisa (qty−receivedQty), tanggal
 *   tercepat; status tertutup-tepat-waktu bila incoming menutup shortageEfektif
 *   dan expectedDate <= startDate WO, terlambat bila sesudahnya.
 * - WO sendiri tidak dihitung terikat (required baris ini sendiri).
 * - baris jasa abaikan.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    workOrder: { findUnique: vi.fn(), findMany: vi.fn() },
    item: { findMany: vi.fn() },
    materialIssue: { findMany: vi.fn() },
    purchaseOrder: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getWorkOrderMaterialNeeds } from "../work-order-material-needs-data"
import { buildWorkOrderMaterialNeeds } from "../work-order-material-needs"

function woTarget() {
  return {
    id: 9,
    startDate: new Date(2026, 9, 20), // 20 Okt 2026
    endDate: new Date(2026, 9, 27),
    items: [
      { itemId: 1, description: null, qty: 8, status: "pending" },
      { itemId: 0, description: "Jasa", qty: 1, status: "pending" },
    ],
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.workOrder.findUnique.mockResolvedValue(woTarget())
  mocks.prismaMock.item.findMany.mockResolvedValue([
    { id: 1, name: "Plat 6mm", unitOfMeasure: "LBR", qtyOnHand: 10 },
  ])
  mocks.prismaMock.materialIssue.findMany.mockResolvedValue([
    { items: [{ itemId: 1, qty: 0 }] },
  ]) // issued target WO = 0 (filter where dipanggil target; baris kosong)
  // WO aktif lain terikat: butuh 8 sisa 8 (issued 0).
  mocks.prismaMock.workOrder.findMany.mockResolvedValue([
    { id: 11, items: [{ itemId: 1, qty: 8, status: "pending" }] },
  ])
  mocks.prismaMock.purchaseOrder.findMany.mockResolvedValue([])
})

describe("getWorkOrderMaterialNeeds ATP", () => {
  it("stok 10 dijanji 2 kali tidak hijau dua kali: terikat WO lain 8, tersedia efektif 2, shortage efektif 6", async () => {
    const r = await getWorkOrderMaterialNeeds(9)
    const plat = r?.lines.find((l) => l.itemId === 1)
    expect(plat).toBeDefined()
    expect(plat).toMatchObject({
      requiredQty: 8,
      issuedQty: 0,
      qtyOnHand: 10,
      committedOtherQty: 8,
      effectiveAvailableQty: 2,
      remainingQty: 8,
      shortageQty: 6,
    })
    expect(r?.shortageCount).toBe(1)
    // Query WO lain: status aktif, bukan WO ini.
    expect(mocks.prismaMock.workOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { not: 9 }, status: { in: ["draft", "pending", "in_progress"] } }),
      }),
    )
  })

  it("WO sendiri tidak dihitung terikat: baris sendiri required 8 tidak mengurangi committedOther", async () => {
    // WO lain hanya 1 WO dengan 1 baris 8; committedOther harus 8, bukan 16.
    const r = await getWorkOrderMaterialNeeds(9)
    expect(r?.lines.find((l) => l.itemId === 1)?.committedOtherQty).toBe(8)
  })

  it("replaced di WO lain tidak terikat; jasa diabaikan", async () => {
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      { id: 11, items: [{ itemId: 1, qty: 8, status: "replaced" }] },
    ])
    const r = await getWorkOrderMaterialNeeds(9)
    const plat = r?.lines.find((l) => l.itemId === 1)
    expect(plat?.committedOtherQty).toBe(0)
    expect(plat?.effectiveAvailableQty).toBe(10)
    expect(plat?.shortageQty).toBe(0)
    expect(r?.lines.find((l) => l.itemId === 0)).toMatchObject({ isService: true, fulfilled: true })
  })
})

describe("incoming bertanggal (F-52)", () => {
  it("PO datang sebelum startDate menutup shortage: status tertutup tepat waktu", async () => {
    mocks.prismaMock.purchaseOrder.findMany.mockResolvedValue([
      {
        expectedDate: new Date(2026, 9, 18),
        items: [{ itemId: 1, qty: 8, receivedQty: 0 }],
      },
    ])
    const r = await getWorkOrderMaterialNeeds(9)
    const plat = r?.lines.find((l) => l.itemId === 1)
    expect(plat).toMatchObject({ orderedQty: 8, incomingQty: 8 })
    expect(plat?.incomingEarliestDate?.toISOString()).toBe(new Date(2026, 9, 18).toISOString())
    expect(plat?.incomingCover).toBe("tepat-waktu")
  })

  it("PO datang sesudah startDate: status terlambat walau qty menutup", async () => {
    mocks.prismaMock.purchaseOrder.findMany.mockResolvedValue([
      {
        expectedDate: new Date(2026, 9, 25),
        items: [{ itemId: 1, qty: 8, receivedQty: 0 }],
      },
    ])
    const r = await getWorkOrderMaterialNeeds(9)
    expect(r?.lines.find((l) => l.itemId === 1)?.incomingCover).toBe("terlambat")
  })

  it("PO tanpa expectedDate tidak bisa janji tepat waktu: status belum-jadwal", async () => {
    mocks.prismaMock.purchaseOrder.findMany.mockResolvedValue([
      { expectedDate: null, items: [{ itemId: 1, qty: 8, receivedQty: 0 }] },
    ])
    const r = await getWorkOrderMaterialNeeds(9)
    const plat = r?.lines.find((l) => l.itemId === 1)
    expect(plat?.incomingQty).toBe(8)
    expect(plat?.incomingEarliestDate).toBeNull()
    expect(plat?.incomingCover).toBe("belum-jadwal")
  })
})

describe("buildWorkOrderMaterialNeeds ATP murni", () => {
  it("shortage efektif memakai tersedia efektif, bukan qtyOnHand mentah", () => {
    const r = buildWorkOrderMaterialNeeds([
      { itemId: 5, name: "Plat", unitOfMeasure: "LBR", requiredQty: 8, qtyOnHand: 10, issuedQty: 0, orderedQty: 0, committedOtherQty: 8 },
    ])
    expect(r.lines[0]).toMatchObject({ effectiveAvailableQty: 2, shortageQty: 6 })
  })

  it("tanpa committedOtherQty (pemanggil lama) tersedia efektif = qtyOnHand", () => {
    const r = buildWorkOrderMaterialNeeds([
      { itemId: 5, name: "Plat", unitOfMeasure: "LBR", requiredQty: 3, qtyOnHand: 10, issuedQty: 0, orderedQty: 0 },
    ])
    expect(r.lines[0]).toMatchObject({ committedOtherQty: 0, effectiveAvailableQty: 10, shortageQty: 0 })
  })
})

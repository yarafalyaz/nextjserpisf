import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Umur WIP (F-2026-10-20-72, read-model aman tanpa migrasi).
 * Yang dijaga: hanya order berjalan dihitung, sisa WIP =
 * totalActualCost − releasedCost dijepit >= 0, umur dari startDate
 * (jatuh ke createdAt) masuk ember 0-30/31-60/61-90/>90, dan loader
 * hanya satu query massal status berjalan.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    productionOrder: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getWipAging } from "../wip-aging-data"
import { buildWipAging, wipBucketForDays, type WipAgingOrderInput } from "../wip-aging"

const AS_OF = new Date("2026-10-20T00:00:00Z")

function daysAgo(days: number): Date {
  return new Date(AS_OF.getTime() - days * 86_400_000)
}

function order(over: Partial<WipAgingOrderInput>): WipAgingOrderInput {
  return {
    id: 1,
    slug: null,
    documentNo: "PO-1",
    status: "in_progress",
    startDate: daysAgo(10),
    createdAt: daysAgo(10),
    qty: 10,
    completedQty: 4,
    totalActualCost: 1_000_000,
    releasedCost: 400_000,
    productName: "Bumper",
    workOrderDocumentNo: "WO-1",
    ...over,
  }
}

describe("buildWipAging", () => {
  it("hanya order berjalan; completed/cancelled dan biayanya disaring", () => {
    const r = buildWipAging({
      asOf: AS_OF,
      orders: [
        order({ id: 1, status: "completed", totalActualCost: 9_000_000, releasedCost: 0 }),
        order({ id: 2, documentNo: "PO-2", status: "cancelled" }),
        order({ id: 3, documentNo: "PO-3", status: "in_progress" }),
      ],
    })
    expect(r.totalOrders).toBe(1)
    expect(r.orders.map((o) => o.id)).toEqual([3])
    expect(r.totalWipAmount).toBe(600_000)
  })

  it("sisa WIP = aktual − dirilis, negatif dijepit nol", () => {
    const r = buildWipAging({
      asOf: AS_OF,
      orders: [order({ id: 1, totalActualCost: 100, releasedCost: 250 })],
    })
    expect(r.orders[0].wipAmount).toBe(0)
    expect(r.totalWipAmount).toBe(0)
  })

  it("umur dari startDate masuk ember yang benar; tanpa startDate jatuh ke createdAt", () => {
    const r = buildWipAging({
      asOf: AS_OF,
      orders: [
        order({ id: 1, documentNo: "PO-1", startDate: daysAgo(10) }),
        order({ id: 2, documentNo: "PO-2", startDate: daysAgo(45) }),
        order({ id: 3, documentNo: "PO-3", startDate: daysAgo(75) }),
        order({ id: 4, documentNo: "PO-4", startDate: daysAgo(120) }),
        order({ id: 5, documentNo: "PO-5", startDate: null, createdAt: daysAgo(31) }),
      ],
    })
    const byId = new Map(r.orders.map((o) => [o.id, o]))
    expect(byId.get(1)).toMatchObject({ ageDays: 10, bucket: "d0_30" })
    expect(byId.get(2)).toMatchObject({ ageDays: 45, bucket: "d31_60" })
    expect(byId.get(3)).toMatchObject({ ageDays: 75, bucket: "d61_90" })
    expect(byId.get(4)).toMatchObject({ ageDays: 120, bucket: "over90" })
    expect(byId.get(5)).toMatchObject({ ageDays: 31, bucket: "d31_60" })
    expect(r.buckets.map((b) => [b.id, b.orderCount])).toEqual([
      ["d0_30", 1],
      ["d31_60", 2],
      ["d61_90", 1],
      ["over90", 1],
    ])
    expect(wipBucketForDays(30)).toBe("d0_30")
    expect(wipBucketForDays(31)).toBe("d31_60")
    expect(wipBucketForDays(90)).toBe("d61_90")
    expect(wipBucketForDays(91)).toBe("over90")
  })

  it("tanggal mulai masa depan dijepit umur nol, persen selesai dijepit 0..100", () => {
    const r = buildWipAging({
      asOf: AS_OF,
      orders: [order({ id: 1, startDate: daysAgo(-5), qty: 10, completedQty: 15 })],
    })
    expect(r.orders[0]).toMatchObject({ ageDays: 0, bucket: "d0_30", completionPercent: 100 })
  })

  it("urutan deterministik: WIP terbesar, lalu tertua, lalu nomor dokumen", () => {
    const r = buildWipAging({
      asOf: AS_OF,
      orders: [
        order({ id: 1, documentNo: "PO-2", totalActualCost: 500, releasedCost: 0, startDate: daysAgo(5) }),
        order({ id: 2, documentNo: "PO-1", totalActualCost: 500, releasedCost: 0, startDate: daysAgo(9) }),
        order({ id: 3, documentNo: "PO-3", totalActualCost: 900, releasedCost: 0, startDate: daysAgo(1) }),
      ],
    })
    expect(r.orders.map((o) => o.id)).toEqual([3, 2, 1])
    expect(r.largestOrderId).toBe(3)
  })

  it("kosong: ember tetap lengkap dengan nol", () => {
    const r = buildWipAging({ asOf: AS_OF, orders: [] })
    expect(r).toMatchObject({ totalOrders: 0, totalWipAmount: 0, largestOrderId: null })
    expect(r.buckets).toHaveLength(4)
    expect(r.buckets.every((b) => b.orderCount === 0 && b.wipAmount === 0)).toBe(true)
  })
})

describe("getWipAging", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.productionOrder.findMany.mockResolvedValue([
      {
        id: 7,
        slug: "po-7",
        documentNo: "PO-7",
        status: "in_progress",
        startDate: daysAgo(40),
        createdAt: daysAgo(40),
        qty: { toString: () => "10" },
        completedQty: { toString: () => "5" },
        totalActualCost: { toString: () => "2000000" },
        releasedCost: { toString: () => "500000" },
        product: { name: "Bumper" },
        workOrder: { documentNo: "WO-7" },
      },
    ])
  })

  it("satu query massal status berjalan; Decimal dikonversi di loader", async () => {
    const r = await getWipAging(AS_OF)
    expect(mocks.prismaMock.productionOrder.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.productionOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ["draft", "pending", "in_progress"] } },
      }),
    )
    expect(r.orders[0]).toMatchObject({
      id: 7,
      ageDays: 40,
      bucket: "d31_60",
      wipAmount: 1_500_000,
      completionPercent: 50,
      productName: "Bumper",
      workOrderDocumentNo: "WO-7",
    })
  })
})

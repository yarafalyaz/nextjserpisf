import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Beban perintah kerja (F-2026-10-20-02, read-model aman tanpa migrasi).
 * Yang dijaga: hanya WO aktif yang dihitung bebannya, jam/nilai diambil dari
 * snapshot ProductionCost (hours/amount) per kategori — bukan hitung ulang
 * tarif master — biaya tanpa workOrderId tidak ditempelkan ke WO mana pun,
 * dan loader hanya dua query massal (tanpa N+1).
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    workOrder: { findMany: vi.fn() },
    productionCost: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getWorkOrderLoad } from "../work-order-load-data"
import {
  buildWorkOrderLoad,
  type WorkOrderLoadCostInput,
  type WorkOrderLoadOrderInput,
} from "../work-order-load"

function order(over: Partial<WorkOrderLoadOrderInput>): WorkOrderLoadOrderInput {
  return { id: 1, slug: null, documentNo: "WO-1", status: "in_progress", ...over }
}

function cost(over: Partial<WorkOrderLoadCostInput>): WorkOrderLoadCostInput {
  return { workOrderId: 1, category: "labor", hours: 2, amount: 100_000, ...over }
}

describe("buildWorkOrderLoad", () => {
  it("hanya WO aktif yang dihitung; status final dan biayanya disaring", () => {
    const r = buildWorkOrderLoad(
      [
        order({ id: 1, status: "completed" }),
        order({ id: 2, documentNo: "WO-2", status: "cancelled" }),
        order({ id: 3, documentNo: "WO-3", status: "pending" }),
      ],
      [cost({ workOrderId: 1 }), cost({ workOrderId: 2 }), cost({ workOrderId: 3, amount: 50_000 })],
    )
    expect(r.totalActive).toBe(1)
    expect(r.workOrders.map((w) => w.id)).toEqual([3])
    expect(r.totalAmount).toBe(50_000)
    expect(r.byStatus.find((g) => g.status === "pending")).toMatchObject({
      workOrderCount: 1,
      totalAmount: 50_000,
    })
    expect(r.byStatus.find((g) => g.status === "in_progress")).toMatchObject({ workOrderCount: 0 })
  })

  it("jam labor/machine dan amount dijumlah dari snapshot baris per kategori", () => {
    const r = buildWorkOrderLoad(
      [order({ id: 1 }), order({ id: 2, documentNo: "WO-2", status: "pending" })],
      [
        cost({ workOrderId: 1, category: "labor", hours: 2.5, amount: 125_000 }),
        cost({ workOrderId: 1, category: "labor", hours: 1.5, amount: 75_000 }),
        cost({ workOrderId: 1, category: "machine", hours: 3, amount: 90_000 }),
        cost({ workOrderId: 1, category: "material", hours: null, amount: 40_000 }),
        cost({ workOrderId: 2, category: "labor", hours: 4, amount: 200_000 }),
      ],
    )
    const wo1 = r.workOrders.find((w) => w.id === 1)
    expect(wo1).toMatchObject({
      laborHours: 4,
      machineHours: 3,
      totalAmount: 330_000,
      costLineCount: 4,
    })
    expect(r.totalLaborHours).toBe(8)
    expect(r.totalMachineHours).toBe(3)
    expect(r.totalAmount).toBe(530_000)
    const inProgress = r.byStatus.find((g) => g.status === "in_progress")
    expect(inProgress?.byCategory.labor).toEqual({ hours: 4, amount: 200_000 })
    expect(inProgress?.byCategory.machine).toEqual({ hours: 3, amount: 90_000 })
    expect(inProgress?.byCategory.material).toEqual({ hours: 0, amount: 40_000 })
  })

  it("baris tanpa jam (hours null) menyumbang amount tanpa menyumbang jam", () => {
    const r = buildWorkOrderLoad(
      [order({ id: 1 })],
      [cost({ workOrderId: 1, category: "overhead", hours: null, amount: 25_000 })],
    )
    expect(r.workOrders[0]).toMatchObject({ laborHours: 0, machineHours: 0, totalAmount: 25_000 })
    expect(r.totalLaborHours).toBe(0)
  })

  it("biaya WO tak dikenal / nonaktif tidak ditempelkan ke WO lain", () => {
    const r = buildWorkOrderLoad(
      [order({ id: 1 })],
      [cost({ workOrderId: 99, amount: 999_000 }), cost({ workOrderId: 1, amount: 10_000 })],
    )
    expect(r.totalAmount).toBe(10_000)
    expect(r.workOrders[0]?.costLineCount).toBe(1)
  })

  it("WO aktif tanpa baris biaya tetap tampil dengan beban nol", () => {
    const r = buildWorkOrderLoad([order({ id: 1 }), order({ id: 2, documentNo: "WO-2" })], [])
    expect(r.workOrders).toHaveLength(2)
    expect(r.workOrders[0]).toMatchObject({ totalAmount: 0, costLineCount: 0 })
    expect(r.byStatus.find((g) => g.status === "in_progress")?.workOrderCount).toBe(2)
  })

  it("urutan WO deterministik per nomor dokumen lalu id", () => {
    const r = buildWorkOrderLoad(
      [
        order({ id: 5, documentNo: "WO-2" }),
        order({ id: 3, documentNo: "WO-1" }),
        order({ id: 4, documentNo: "WO-1" }),
      ],
      [],
    )
    expect(r.workOrders.map((w) => w.id)).toEqual([3, 4, 5])
  })

  it("jumlah jam desimal dibulatkan 2 angka agar drift float tidak bocor", () => {
    const r = buildWorkOrderLoad(
      [order({ id: 1 })],
      [
        cost({ workOrderId: 1, hours: 0.1, amount: 1 }),
        cost({ workOrderId: 1, hours: 0.2, amount: 1 }),
      ],
    )
    expect(r.totalLaborHours).toBe(0.3)
  })
})

describe("getWorkOrderLoad", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      { id: 7, slug: "wo-7", documentNo: "WO-7", status: "in_progress" },
      { id: 8, slug: null, documentNo: "WO-8", status: "draft" },
    ])
    mocks.prismaMock.productionCost.findMany.mockResolvedValue([
      { workOrderId: 7, category: "labor", hours: { toString: () => "2.50" }, amount: 150_000 },
      { workOrderId: 7, category: "machine", hours: null, amount: 30_000 },
      { workOrderId: null, category: "labor", hours: 9, amount: 999_000 },
      { workOrderId: 8, category: "labor", hours: 1, amount: 50_000 },
    ])
  })

  it("dua query massal status aktif; biaya workOrderId null dibuang di loader", async () => {
    const r = await getWorkOrderLoad()
    expect(mocks.prismaMock.workOrder.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.workOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ["draft", "pending", "in_progress"] } },
      }),
    )
    expect(mocks.prismaMock.productionCost.findMany).toHaveBeenCalledTimes(1)
    expect(mocks.prismaMock.productionCost.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workOrderId: { in: [7, 8] } } }),
    )
    expect(r.workOrders.find((w) => w.id === 7)).toMatchObject({
      laborHours: 2.5,
      totalAmount: 180_000,
      costLineCount: 2,
    })
    expect(r.totalAmount).toBe(230_000)
  })

  it("tanpa WO aktif: query biaya dilewati, hasil kosong", async () => {
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([])
    const r = await getWorkOrderLoad()
    expect(mocks.prismaMock.productionCost.findMany).not.toHaveBeenCalled()
    expect(r).toMatchObject({ totalActive: 0, totalAmount: 0, workOrders: [] })
  })
})

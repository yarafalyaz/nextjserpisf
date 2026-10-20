import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Laporan Job Order menghitung biaya pekerjaan dari tiga sumber: bahan
 * (`MaterialIssue.workOrderId`), biaya produksi (`ProductionCost.workOrderId`
 * atau lewat perintah produksinya), dan hasil (`ProductionOrder.workOrderId` →
 * `completedQty`).
 *
 * Sisi data itulah yang dulu putus: `ProductionOrder.workOrderId` tak pernah
 * diisi, jadi kolom "Selesai" dan "Biaya Produksi" per pekerjaan selalu nol
 * walau perintah produksinya ada. Tes ini mengunci bahwa begitu tautannya ada,
 * laporannya benar-benar menghitung — dan bahwa pengeluaran material tanpa
 * `workOrderId` (sisi orphan) memang tidak ikut dihitung.
 */

const mocks = vi.hoisted(() => {
  const prismaMock: Record<string, unknown> = {
    workOrder: { findMany: vi.fn().mockResolvedValue([]) },
    materialIssue: { findMany: vi.fn().mockResolvedValue([]) },
    productionCost: { findMany: vi.fn().mockResolvedValue([]) },
    productionOrder: { findMany: vi.fn().mockResolvedValue([]) },
  }
  return { prismaMock: prismaMock as any }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadJobOrderCost } from "../job-order-data"

const period = {
  start: new Date("2026-10-01T00:00:00.000Z"),
  end: new Date("2026-10-31T23:59:59.000Z"),
}

const WORK_ORDER = {
  id: 1,
  documentNo: "WO-0001",
  date: new Date("2026-10-05T00:00:00.000Z"),
  status: "in_progress",
  customer: { name: "Toko Maju" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.workOrder.findMany.mockResolvedValue([WORK_ORDER])
  // Implementasi mock bertahan antar-tes (clearAllMocks hanya membuang jejak
  // panggilan), jadi tiap sumber direset eksplisit ke kosong.
  mocks.prismaMock.materialIssue.findMany.mockResolvedValue([])
  mocks.prismaMock.productionCost.findMany.mockResolvedValue([])
  mocks.prismaMock.productionOrder.findMany.mockResolvedValue([])
})

describe("loadJobOrderCost — data dari perintah produksi yang tertaut WO", () => {
  it("menghitung biaya produksi dan kuantitas selesai dari perintah produksi", async () => {
    mocks.prismaMock.materialIssue.findMany.mockResolvedValue([
      { workOrderId: 1, items: [{ qty: 2, cost: 5_000 }] },
    ])
    // Biaya yang menempel pada perintah produksi (bukan langsung ke WO).
    mocks.prismaMock.productionCost.findMany.mockResolvedValue([
      { workOrderId: null, amount: 250_000, productionOrder: { workOrderId: 1 } },
    ])
    mocks.prismaMock.productionOrder.findMany.mockResolvedValue([
      { workOrderId: 1, completedQty: 5 },
    ])

    const { cost } = await loadJobOrderCost(period)

    expect(cost.totals.materialCost).toBe(10_000)
    expect(cost.totals.productionCost).toBe(250_000)
    expect(cost.totals.completedQty).toBe(5)
    expect(cost.totals.totalCost).toBe(260_000)
    expect(cost.jobCount).toBe(1)
  })

  it("17 baris bahan 1 x 0,24 per WO tepat 4,08 (bukan 4,080000000000002)", async () => {
    mocks.prismaMock.materialIssue.findMany.mockResolvedValue([
      {
        workOrderId: 1,
        items: Array.from({ length: 17 }, () => ({ qty: 1, cost: 0.24 })),
      },
    ])

    const { cost } = await loadJobOrderCost(period)

    expect(cost.totals.materialCost).toBe(4.08)
  })

  it("3 baris bahan 1 x 0,335 dibulatkan per baris ke sen", async () => {
    mocks.prismaMock.materialIssue.findMany.mockResolvedValue([
      {
        workOrderId: 1,
        items: Array.from({ length: 3 }, () => ({ qty: 1, cost: 0.335 })),
      },
    ])

    const { cost } = await loadJobOrderCost(period)

    expect(cost.totals.materialCost).toBe(1.02)
  })

  it("akumulasi biaya produksi lintas baris tepat sen", async () => {
    mocks.prismaMock.productionCost.findMany.mockResolvedValue(
      Array.from({ length: 17 }, () => ({
        workOrderId: 1,
        amount: 0.24,
        productionOrder: null,
      })),
    )

    const { cost } = await loadJobOrderCost(period)

    expect(cost.totals.productionCost).toBe(4.08)
    expect(cost.totals.totalCost).toBe(4.08)
  })

  it("mengabaikan pengeluaran material tanpa workOrderId (sisi orphan)", async () => {
    mocks.prismaMock.materialIssue.findMany.mockResolvedValue([
      { workOrderId: null, items: [{ qty: 2, cost: 5_000 }] },
    ])

    const { cost } = await loadJobOrderCost(period)

    expect(cost.totals.materialCost).toBe(0)
    expect(cost.totals.completedQty).toBe(0)
  })
})

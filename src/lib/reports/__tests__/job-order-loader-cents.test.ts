import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader biaya-pekerjaan menjumlah bahan (qty x cost per baris MaterialIssue)
 * dan biaya produksi per WO. Float mentah: 17 baris x 0,24 = 4,080000000000002,
 * dan 3 x 0,335 tidak bulat sen — builder buildJobOrderCost meng-round tiap
 * total per WO secara safeAdd, jadi galat loader lolos sebagai materialCost/
 * productionCost tidak persis sen per WO. Tes ini mengunci akumulasi loader
 * sendiri sen-aman (bukan hanya total akhir builder).
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
  mocks.prismaMock.materialIssue.findMany.mockResolvedValue([])
  mocks.prismaMock.productionCost.findMany.mockResolvedValue([])
  mocks.prismaMock.productionOrder.findMany.mockResolvedValue([])
})

describe("loadJobOrderCost — akumulasi loader presisi sen", () => {
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
})

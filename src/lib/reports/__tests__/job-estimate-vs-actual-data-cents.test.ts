import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Presisi sen loader estimasi vs aktual: total ditagih per pekerjaan dan
 * total biaya aktual harus menutup persis (2 desimal). Builder sudah
 * safeRound per baris, tetapi akumulasi loader float mentah membuat baris
 * di laporan meleset sen dari sumbernya (17 x 0.24 = 4.080000000000002).
 */

const mocks = vi.hoisted(() => {
  const prismaMock = {
    workOrder: { findMany: vi.fn().mockResolvedValue([]) },
    salesOrder: { findMany: vi.fn().mockResolvedValue([]) },
    salesInvoice: { findMany: vi.fn().mockResolvedValue([]) },
    productionCost: { findMany: vi.fn().mockResolvedValue([]) },
  }
  return { prismaMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadJobEstimateVsActual } from "../job-estimate-vs-actual-data"

const PERIOD = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.workOrder.findMany.mockResolvedValue([
    {
      id: 1,
      documentNo: "WO-0001",
      date: new Date("2026-10-05T00:00:00"),
      status: "completed",
      quotationId: 9,
      projectId: null,
      customer: { name: "Bengkel Jaya" },
      customerVehicle: null,
      quotation: { status: "accepted", grandTotal: 100 },
      productionOrders: [],
    },
  ])
  mocks.prismaMock.salesOrder.findMany.mockResolvedValue([])
  mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
  mocks.prismaMock.productionCost.findMany.mockResolvedValue([])
})

describe("loadJobEstimateVsActual — presisi sen", () => {
  it("17 invoice x 0.24 tertagih menutup persis 4.08", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue(
      Array.from({ length: 17 }, (_, i) => ({
        id: i + 1,
        quotationId: 9,
        salesOrderId: null,
        projectId: null,
        status: "posted",
        grandTotal: 0.24,
        deletedAt: null,
      })),
    )

    const r = await loadJobEstimateVsActual(PERIOD)

    expect(r.estimate.rows[0].billedAmount).toBe(4.08)
  })

  it("17 biaya produksi x 0.24 menutup persis 4.08", async () => {
    mocks.prismaMock.productionCost.findMany.mockResolvedValue(
      Array.from({ length: 17 }, () => ({
        workOrderId: 1,
        amount: 0.24,
        productionOrder: null,
      })),
    )

    const r = await loadJobEstimateVsActual(PERIOD)

    expect(r.estimate.rows[0].actualCost).toBe(4.08)
    expect(r.estimate.rows[0].actualMargin).toBe(-4.08)
  })
})

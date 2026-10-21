import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader read-model margin job per kendaraan (F-2026-10-21-033).
 *
 * Builder murni terkunci di vehicle-margin.test.ts; di sini yang dijaga:
 * rantai (b) WO non-proyek (billed jembatan quotation/SO dedup per id,
 * invoice ber-projectId tidak dipinjam, ProductionCost via WO/ProductionOrder)
 * dan rantai (c) invoice langsung ber-kendaraan tanpa jembatan. Rantai (a)
 * proyek adalah `loadProjectPlReport` existing — di-mock di sini supaya
 * tes ini hanya menjaga gulirannya.
 */

const mocks = vi.hoisted(() => {
  const prismaMock = {
    project: { findMany: vi.fn().mockResolvedValue([]) },
    workOrder: { findMany: vi.fn().mockResolvedValue([]) },
    salesOrder: { findMany: vi.fn().mockResolvedValue([]) },
    salesInvoice: { findMany: vi.fn().mockResolvedValue([]) },
    productionCost: { findMany: vi.fn().mockResolvedValue([]) },
    customerVehicle: { findMany: vi.fn().mockResolvedValue([]) },
  }
  const projectPlReport = vi.fn()
  return { prismaMock, projectPlReport }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))
vi.mock("@/lib/reports/project-pl-data", () => ({
  loadProjectPlReport: mocks.projectPlReport,
}))

import { loadVehicleMarginReport } from "../vehicle-margin-data"

const PERIOD = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

function resetMocks() {
  vi.clearAllMocks()
  const p = mocks.prismaMock
  mocks.projectPlReport.mockResolvedValue({
    rows: [],
    periodLabel: "Periode",
    periodCaption: "Periode",
  })
  p.project.findMany.mockResolvedValue([])
  p.workOrder.findMany.mockResolvedValue([])
  p.salesOrder.findMany.mockResolvedValue([])
  p.salesInvoice.findMany.mockResolvedValue([])
  p.productionCost.findMany.mockResolvedValue([])
  p.customerVehicle.findMany.mockResolvedValue([])
}

beforeEach(resetMocks)

describe("loadVehicleMarginReport — rantai loader F-2026-10-21-033", () => {
  it("(b) WO non-proyek: billed dedup dua jembatan + biaya via ProductionOrder", async () => {
    const p = mocks.prismaMock
    p.workOrder.findMany.mockResolvedValue([
      {
        id: 50,
        date: new Date("2026-10-05"),
        documentNo: "WO-0050",
        quotationId: 100,
        customerVehicleId: 7,
        customer: { name: "PT A" },
        customerVehicle: { plateNumber: "B 1234 AA" },
        productionOrders: [{ id: 500 }],
      },
    ])
    p.salesOrder.findMany.mockResolvedValue([{ id: 300, quotationId: 100 }])
    const shared = {
      id: 900, quotationId: 100, salesOrderId: 300, projectId: null,
      status: "posted", grandTotal: 4_000_000, deletedAt: null,
    }
    p.salesInvoice.findMany
      .mockResolvedValueOnce([shared]) // jembatan quotation
      .mockResolvedValueOnce([shared]) // jembatan SO — invoice sama, tetap sekali
      .mockResolvedValueOnce([]) // (c) invoice langsung
    p.productionCost.findMany.mockResolvedValue([
      { workOrderId: null, amount: 1_000_000, productionOrder: { workOrderId: 50 } },
    ])

    const r = await loadVehicleMarginReport(PERIOD)

    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({
      customerVehicleId: 7,
      vehiclePlate: "B 1234 AA",
      revenue: 4_000_000,
      productionCost: 1_000_000,
      profit: 3_000_000,
      jobCount: 1,
    })
    // Query WO dibatasi non-proyek + periode.
    const woWhere = p.workOrder.findMany.mock.calls[0][0].where
    expect(woWhere.projectId).toBeNull()
    expect(woWhere.date).toEqual({ gte: PERIOD.start, lte: PERIOD.end })
  })

  it("(b) invoice ber-projectId tidak dipinjam ke WO non-proyek", async () => {
    const p = mocks.prismaMock
    p.workOrder.findMany.mockResolvedValue([
      {
        id: 50, date: new Date("2026-10-05"), documentNo: "WO-0050",
        quotationId: 100, customerVehicleId: 7,
        customer: { name: "PT A" }, customerVehicle: { plateNumber: null },
        productionOrders: [],
      },
    ])
    p.salesInvoice.findMany
      .mockResolvedValueOnce([
        { id: 901, quotationId: 100, salesOrderId: null, projectId: 3, status: "posted", grandTotal: 9_000_000, deletedAt: null },
      ])
      .mockResolvedValueOnce([])

    const r = await loadVehicleMarginReport(PERIOD)

    expect(r.rows[0].revenue).toBe(0)
    expect(r.rows[0].jobCount).toBe(1)
  })

  it("(c) invoice langsung: subtotal-diskon, plat dari query kendaraan terpisah", async () => {
    const p = mocks.prismaMock
    p.salesInvoice.findMany.mockResolvedValueOnce([
      {
        id: 950, customerVehicleId: 9, subtotal: 2_500_000, discount: 500_000,
        customer: { name: "PT C" },
      },
    ])
    p.customerVehicle.findMany.mockResolvedValue([{ id: 9, plateNumber: "D 9" }])

    const r = await loadVehicleMarginReport(PERIOD)

    expect(r.rows[0]).toMatchObject({
      customerVehicleId: 9,
      vehiclePlate: "D 9",
      revenue: 2_000_000,
      directInvoiceCount: 1,
      hasUnlinkedRevenue: true,
    })
    const directWhere = p.salesInvoice.findMany.mock.calls[0][0].where
    expect(directWhere).toMatchObject({
      customerVehicleId: { not: null },
      quotationId: null,
      salesOrderId: null,
      projectId: null,
      deletedAt: null,
    })
  })

  it("(a) proyek digulirkan per customerVehicleId proyek, bukan plat", async () => {
    mocks.projectPlReport.mockResolvedValue({
      rows: [
        {
          projectId: 1, revenue: 20_000_000, materialCost: 0, productionCost: 5_000_000,
          expenseCost: 0, pettyCashCost: 0, vendorBillCost: 0, totalCost: 5_000_000,
          profit: 15_000_000, marginPercent: 75, revenueInvoiceIds: [1],
          materialIssueIds: [], vendorBillIds: [], unpulledTimesheetHours: 0,
          unpulledTimesheetCount: 0, projectDocumentNo: "PRJ-1", projectName: "P",
          customerName: "PT A", vehiclePlate: "B 1", projectStatus: "active",
        },
      ],
      periodLabel: "Periode",
      periodCaption: "Periode",
    })
    mocks.prismaMock.project.findMany.mockResolvedValue([{ id: 1, customerVehicleId: 7 }])

    const r = await loadVehicleMarginReport(PERIOD)

    expect(r.rows[0]).toMatchObject({
      customerVehicleId: 7,
      revenue: 20_000_000,
      productionCost: 5_000_000,
      projectCount: 1,
    })
    expect(r.label).toBe("margin job kendaraan")
  })
})

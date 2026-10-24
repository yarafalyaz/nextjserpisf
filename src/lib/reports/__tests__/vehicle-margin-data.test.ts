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
    materialIssue: { findMany: vi.fn().mockResolvedValue([]) },
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
  // mockReset (bukan clearAllMocks): antrean mockResolvedValueOnce sisa tes
  // yang gagal di tengah wajib dibuang, kalau tidak bocor ke tes berikut.
  for (const model of Object.values(mocks.prismaMock)) {
    for (const fn of Object.values(model)) fn.mockReset()
  }
  mocks.projectPlReport.mockReset()
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
  p.materialIssue.findMany.mockResolvedValue([])
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
      status: "posted", grandTotal: 4_000_000, subtotal: 4_000_000, discount: 0, deletedAt: null,
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
        { id: 901, quotationId: 100, salesOrderId: null, projectId: 3, status: "posted", grandTotal: 9_000_000, subtotal: 9_000_000, discount: 0, deletedAt: null },
      ])
      .mockResolvedValueOnce([])

    const r = await loadVehicleMarginReport(PERIOD)

    expect(r.rows[0].revenue).toBe(0)
    expect(r.rows[0].jobCount).toBe(1)
  })

  it("(b) basis DPP: DPP 100jt + PPN 11% grandTotal 111jt -> revenue 100jt minus diskon (Q-033-1)", async () => {
    const p = mocks.prismaMock
    p.workOrder.findMany.mockResolvedValue([
      {
        id: 50, date: new Date("2026-10-05"), documentNo: "WO-0050",
        quotationId: 100, customerVehicleId: 7,
        customer: { name: "PT A" }, customerVehicle: { plateNumber: "B 1234 AA" },
        productionOrders: [],
      },
    ])
    p.salesInvoice.findMany
      .mockResolvedValueOnce([
        {
          id: 910, quotationId: 100, salesOrderId: null, projectId: null,
          status: "posted", grandTotal: 111_000_000,
          subtotal: 100_000_000, discount: 5_000_000, deletedAt: null,
        },
      ])
      .mockResolvedValueOnce([]) // (c) invoice langsung

    const r = await loadVehicleMarginReport(PERIOD)

    expect(r.rows[0].revenue).toBe(95_000_000)
    expect(r.rows[0].revenue).not.toBe(111_000_000)
  })

  it("(b) MI completed langsung WO: hasUnlinkedMaterial true, totalCost tetap ProductionCost-only (Q-033-2)", async () => {
    const p = mocks.prismaMock
    p.workOrder.findMany.mockResolvedValue([
      {
        id: 50, date: new Date("2026-10-05"), documentNo: "WO-0050",
        quotationId: null, customerVehicleId: 7,
        customer: { name: "PT A" }, customerVehicle: { plateNumber: "B 1234 AA" },
        productionOrders: [],
      },
      {
        id: 51, date: new Date("2026-10-06"), documentNo: "WO-0051",
        quotationId: null, customerVehicleId: 8,
        customer: { name: "PT B" }, customerVehicle: { plateNumber: "B 8" },
        productionOrders: [],
      },
    ])
    p.materialIssue.findMany.mockResolvedValue([{ workOrderId: 50 }])
    p.productionCost.findMany.mockResolvedValue([
      { workOrderId: 50, amount: 1_000_000, productionOrder: null },
    ])

    const r = await loadVehicleMarginReport(PERIOD)

    const flagged = r.rows.find((x) => x.customerVehicleId === 7)
    const clean = r.rows.find((x) => x.customerVehicleId === 8)
    expect(flagged?.hasUnlinkedMaterial).toBe(true)
    expect(flagged?.totalCost).toBe(1_000_000)
    expect(flagged?.materialCost).toBe(0)
    expect(clean?.hasUnlinkedMaterial).toBe(false)
    // Penanda keberadaan saja: hanya workOrderId WO cakupan + status completed.
    const miWhere = p.materialIssue.findMany.mock.calls[0][0].where
    expect(miWhere).toEqual({ workOrderId: { in: [50, 51] }, status: "completed" })
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
    mocks.prismaMock.project.findMany.mockImplementation(async (args: { select?: Record<string, unknown> }) =>
      args?.select?.customer
        ? [{ id: 1, customerVehicleId: 7, customer: { name: "PT A" }, customerVehicle: { plateNumber: "B 1" } }]
        : [{ id: 1, customerVehicleId: 7 }],
    )

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

describe("loadVehicleMarginReport — memo unbilled E129-4", () => {
  const FORTY = 40_000_000

  it("(b-memo) WO non-proyek invoice draft DPP 40jt: revenue 0, memo 40jt; cancelled+deleted 0", async () => {
    const p = mocks.prismaMock
    p.workOrder.findMany
      .mockResolvedValueOnce([
        {
          id: 50, date: new Date("2026-10-05"), documentNo: "WO-0050",
          quotationId: 100, customerVehicleId: 7,
          customer: { name: "PT A" }, customerVehicle: { plateNumber: "B 7" },
          productionOrders: [],
        },
      ])
      .mockResolvedValue([])
    const bridge = [
      { id: 900, quotationId: 100, salesOrderId: null, projectId: null, customerVehicleId: null, status: "draft", subtotal: FORTY, discount: 0, deletedAt: null },
      { id: 901, quotationId: 100, salesOrderId: null, projectId: null, customerVehicleId: null, status: "cancelled", subtotal: FORTY, discount: 0, deletedAt: null },
      { id: 902, quotationId: 100, salesOrderId: null, projectId: null, customerVehicleId: null, status: "approved", subtotal: FORTY, discount: 0, deletedAt: new Date("2026-10-09") },
    ]
    p.salesInvoice.findMany
      .mockResolvedValueOnce(bridge) // (b) quotation bridge (billed+memo)
      .mockResolvedValueOnce([]) // (c) billed langsung
      .mockResolvedValueOnce([]) // (c-memo) langsung
      .mockResolvedValueOnce([]) // (a-memo) direct project
      .mockResolvedValueOnce([]) // (a-memo) bridge project
    p.project.findMany.mockResolvedValue([
      { id: 3, customerVehicleId: 7, customer: { name: "PT A" }, customerVehicle: { plateNumber: "B 7" } },
    ])

    const r = await loadVehicleMarginReport(PERIOD)
    const row = r.rows.find((x) => x.customerVehicleId === 7)
    expect(row?.revenue).toBe(0)
    expect(row?.profit).toBe(0)
    expect(row?.marginPercent).toBe(0)
    expect(row?.unbilledMemo).toBe(FORTY)
    expect(row?.unbilledByStatus).toEqual({ draft: FORTY, approved: 0, sent: 0 })
    expect(r.totals.unbilledMemo).toBe(FORTY)
    expect(r.totals.revenue).toBe(0)
  })

  it("(b-memo) invoice memo sama dua jembatan + basis DPP (grandTotal/PPN tidak masuk), diskon kurangi", async () => {
    const p = mocks.prismaMock
    p.workOrder.findMany
      .mockResolvedValueOnce([
        {
          id: 50, date: new Date("2026-10-05"), documentNo: "WO-0050",
          quotationId: 100, customerVehicleId: 7,
          customer: { name: "PT A" }, customerVehicle: { plateNumber: "B 7" },
          productionOrders: [],
        },
      ])
      .mockResolvedValue([])
    p.salesOrder.findMany.mockResolvedValue([{ id: 300, quotationId: 100 }])
    const shared = {
      id: 900, quotationId: 100, salesOrderId: 300, projectId: null, customerVehicleId: null,
      status: "sent", grandTotal: 111_000_000, subtotal: 100_000_000, discount: 5_000_000,
      taxAmount: 11_000_000, totalAmount: 111_000_000, paidAmount: 0, deletedAt: null,
    }
    p.salesInvoice.findMany
      .mockResolvedValueOnce([shared]) // quotation bridge
      .mockResolvedValueOnce([shared]) // SO bridge — invoice sama
      .mockResolvedValueOnce([]) // (c) billed langsung
      .mockResolvedValue([])

    const r = await loadVehicleMarginReport(PERIOD)
    const row = r.rows.find((x) => x.customerVehicleId === 7)
    expect(row?.unbilledMemo).toBe(95_000_000)
    expect(row?.unbilledByStatus.sent).toBe(95_000_000)
    expect(r.totals.unbilledMemo).toBe(95_000_000)
    expect(row?.revenue).toBe(0)
  })

  it("(a)+(b)+(c) kendaraan sama tidak dobel; invoice ber-projectId milik proyek bukan WO", async () => {
    const p = mocks.prismaMock
    mocks.projectPlReport.mockResolvedValue({
      rows: [
        {
          projectId: 3, revenue: 0, materialCost: 0, productionCost: 0,
          expenseCost: 0, pettyCashCost: 0, vendorBillCost: 0, totalCost: 0,
          profit: 0, marginPercent: 0, revenueInvoiceIds: [],
          materialIssueIds: [], vendorBillIds: [], unpulledTimesheetHours: 0,
          unpulledTimesheetCount: 0, projectDocumentNo: "PRJ-3", projectName: "P3",
          customerName: "PT A", vehiclePlate: "B 7", projectStatus: "active",
        },
      ],
      periodLabel: "Periode", periodCaption: "Periode",
    })
    p.project.findMany.mockImplementation(async (args: { select?: Record<string, unknown> }) =>
      args?.select?.customer
        ? [{ id: 3, customerVehicleId: 7, customer: { name: "PT A" }, customerVehicle: { plateNumber: "B 7" } }]
        : [{ id: 3, customerVehicleId: 7 }],
    )
    p.workOrder.findMany
      .mockResolvedValueOnce([
        {
          id: 50, date: new Date("2026-10-05"), documentNo: "WO-0050",
          quotationId: 100, customerVehicleId: 7,
          customer: { name: "PT A" }, customerVehicle: { plateNumber: "B 7" },
          productionOrders: [],
        },
      ]) // (b) WO non-proyek
      .mockResolvedValueOnce([{ projectId: 3, quotationId: 200 }]) // (a-memo) WO proyek
    const invProject = { id: 900, quotationId: 100, salesOrderId: null, projectId: 3, customerVehicleId: null, status: "draft", subtotal: 10_000_000, discount: 0, deletedAt: null }
    const invBridgeProject = { id: 901, quotationId: 200, salesOrderId: null, projectId: null, customerVehicleId: null, status: "approved", subtotal: 20_000_000, discount: 0, deletedAt: null }
    const invDirect = { id: 902, customerVehicleId: 7, status: "sent", subtotal: 30_000_000, discount: 0, customer: { name: "PT A" } }
    p.salesInvoice.findMany
      .mockResolvedValueOnce([invProject]) // (b) bridge — ber-projectId, bukan WO
      .mockResolvedValueOnce([]) // (c) billed langsung
      .mockResolvedValueOnce([invDirect]) // (c-memo) langsung
      .mockResolvedValueOnce([invProject]) // (a-memo) direct project
      .mockResolvedValueOnce([invBridgeProject]) // (a-memo) bridge quotation WO proyek
    p.customerVehicle.findMany.mockResolvedValue([{ id: 7, plateNumber: "B 7" }])

    const r = await loadVehicleMarginReport(PERIOD)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].customerVehicleId).toBe(7)
    expect(r.rows[0].revenue).toBe(0)
    expect(r.rows[0].unbilledMemo).toBe(60_000_000)
    expect(r.rows[0].unbilledByStatus).toEqual({ draft: 10_000_000, approved: 20_000_000, sent: 30_000_000 })
    expect(r.totals.unbilledMemo).toBe(60_000_000)
    const memoWhere = p.salesInvoice.findMany.mock.calls[3][0].where
    expect(memoWhere).toMatchObject({ projectId: { in: [3] }, status: { in: ["draft", "approved", "sent"] }, deletedAt: null })
  })

  it("(c-memo) invoice langsung memo saja: baris tampil revenue 0; where persis kelas (c) + status memo", async () => {
    const p = mocks.prismaMock
    p.salesInvoice.findMany
      .mockResolvedValueOnce([]) // (c) billed
      .mockResolvedValueOnce([
        { id: 950, customerVehicleId: 9, status: "draft", subtotal: 2_500_000, discount: 500_000, customer: { name: "PT C" } },
      ])
    p.customerVehicle.findMany.mockResolvedValue([{ id: 9, plateNumber: "D 9" }])

    const r = await loadVehicleMarginReport(PERIOD)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({ customerVehicleId: 9, revenue: 0, unbilledMemo: 2_000_000 })
    expect(r.rows[0].unbilledByStatus.draft).toBe(2_000_000)
    const memoWhere = p.salesInvoice.findMany.mock.calls[1][0].where
    expect(memoWhere).toMatchObject({
      customerVehicleId: { not: null }, quotationId: null, salesOrderId: null,
      projectId: null, deletedAt: null, status: { in: ["draft", "approved", "sent"] },
    })
  })
})

import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader read-model Laba/Rugi Proyek (F-2026-10-21-029).
 *
 * Builder pure terkunci di project-pl.test.ts; di sini yang dijaga adalah
 * rantai datanya: query massal per sumber tanpa N+1, periode diteruskan ke
 * setiap query dokumen, ProductionCost benar-benar dimuat lewat WO proyek
 * (bukan 0 seperti page lama), dan proyek tanpa dokumen periode tidak
 * ditampilkan.
 */

const mocks = vi.hoisted(() => {
  const prismaMock = {
    project: { findMany: vi.fn().mockResolvedValue([]), findFirst: vi.fn().mockResolvedValue(null) },
    workOrder: { findMany: vi.fn().mockResolvedValue([]) },
    salesInvoice: { findMany: vi.fn().mockResolvedValue([]) },
    materialIssue: { findMany: vi.fn().mockResolvedValue([]) },
    productionCost: { findMany: vi.fn().mockResolvedValue([]) },
    expense: { findMany: vi.fn().mockResolvedValue([]) },
    pettyCash: { findMany: vi.fn().mockResolvedValue([]) },
    vendorBill: { findMany: vi.fn().mockResolvedValue([]) },
    timesheet: { findMany: vi.fn().mockResolvedValue([]) },
  }
  return { prismaMock }
})

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { loadProjectPlForProject, loadProjectPlReport } from "../project-pl-data"

const PERIOD = { start: new Date("2026-10-01T00:00:00"), end: new Date("2026-10-31T23:59:59") }

const PROJECT = {
  id: 1,
  documentNo: "PRJ-0001",
  name: "Armoring APV",
  status: "active",
  customer: { name: "PT Logistik" },
  customerVehicle: { plateNumber: "B 1234 CD" },
}

function resetMocks() {
  vi.clearAllMocks()
  const p = mocks.prismaMock
  p.project.findMany.mockResolvedValue([{ ...PROJECT }])
  p.project.findFirst.mockResolvedValue({ id: 1 })
  p.workOrder.findMany.mockResolvedValue([
    { id: 10, projectId: 1, quotationId: 100, status: "in_progress" },
  ])
  p.salesInvoice.findMany.mockResolvedValue([])
  p.materialIssue.findMany.mockResolvedValue([])
  p.productionCost.findMany.mockResolvedValue([])
  p.expense.findMany.mockResolvedValue([])
  p.pettyCash.findMany.mockResolvedValue([])
  p.vendorBill.findMany.mockResolvedValue([])
  p.timesheet.findMany.mockResolvedValue([])
}

beforeEach(resetMocks)

describe("loadProjectPlReport — rantai loader F-2026-10-21-029", () => {
  it("fixture wajib lewat loader: ProductionCost labor 5jt terbaca, invoice 20jt, laba 15jt", async () => {
    const p = mocks.prismaMock
    p.salesInvoice.findMany.mockResolvedValue([
      { id: 1, projectId: 1, quotationId: null, status: "posted", subtotal: 20_000_000, discount: 0, deletedAt: null },
    ])
    p.productionCost.findMany.mockResolvedValue([
      { workOrderId: 10, amount: 5_000_000, sourceTimesheetId: 7, purchaseOrderId: null },
    ])
    p.timesheet.findMany.mockResolvedValue([{ id: 7, projectId: 1, hours: 40 }])

    const r = await loadProjectPlReport(PERIOD)

    expect(r.rows).toHaveLength(1)
    expect(r.rows[0]).toMatchObject({
      projectId: 1,
      revenue: 20_000_000,
      productionCost: 5_000_000,
      totalCost: 5_000_000,
      profit: 15_000_000,
      unpulledTimesheetHours: 0,
      projectName: "Armoring APV",
      customerName: "PT Logistik",
      vehiclePlate: "B 1234 CD",
    })
    // ProductionCost diminta lewat himpunan WO proyek — bukan query per proyek.
    const costWhere = p.productionCost.findMany.mock.calls[0][0].where
    expect(costWhere).toEqual({ workOrderId: { in: [10] } })
  })

  it("invoice jembatan quotation WO termuat lewat query kedua dan tidak dobel", async () => {
    const p = mocks.prismaMock
    const shared = {
      id: 5, projectId: 1, quotationId: 100, status: "posted",
      subtotal: 20_000_000, discount: 0, deletedAt: null,
    }
    // Urutan Promise.all loader: direct, bridge, ... — invoice yang sama
    // muncul di dua hasil query harus tetap terhitung sekali oleh builder.
    p.salesInvoice.findMany
      .mockResolvedValueOnce([shared])
      .mockResolvedValueOnce([shared])

    const r = await loadProjectPlReport(PERIOD)

    expect(r.rows[0].revenue).toBe(20_000_000)
    expect(r.rows[0].revenueInvoiceIds).toEqual([5])
    const calls = p.salesInvoice.findMany.mock.calls.map((c) => c[0])
    expect(calls[0].where.projectId).toEqual({ not: null })
    expect(calls[1].where.quotationId).toEqual({ in: [100] })
  })

  it("periode + status diteruskan ke query dokumen (pola page existing)", async () => {
    await loadProjectPlReport(PERIOD)
    const p = mocks.prismaMock

    const invWhere = p.salesInvoice.findMany.mock.calls[0][0].where
    expect(invWhere.status).toEqual({ in: ["posted", "partial", "paid"] })
    expect(invWhere.date).toEqual({ gte: PERIOD.start, lte: PERIOD.end })
    expect(invWhere.deletedAt).toBeNull()

    const miWhere = p.materialIssue.findMany.mock.calls[0][0].where
    expect(miWhere.status).toBe("completed")

    const expWhere = p.expense.findMany.mock.calls[0][0].where
    expect(expWhere.status).toBe("approved")

    const pettyWhere = p.pettyCash.findMany.mock.calls[0][0].where
    expect(pettyWhere.type).toBe("OUT")

    const billWhere = p.vendorBill.findMany.mock.calls[0][0].where
    expect(billWhere.status).toEqual({ in: ["confirmed", "posted", "partial", "paid"] })
  })

  it("tanpa dokumen apa pun pada periode: rows kosong, project tidak diquery", async () => {
    const p = mocks.prismaMock
    p.workOrder.findMany.mockResolvedValue([])
    p.project.findMany.mockResolvedValue([])

    const r = await loadProjectPlReport(PERIOD)

    expect(r.rows).toEqual([])
    expect(r.periodLabel).toContain("Periode")
  })

  it("memo jam belum ditarik diteruskan loader apa adanya (jam, bukan uang)", async () => {
    const p = mocks.prismaMock
    p.timesheet.findMany.mockResolvedValue([
      { id: 8, projectId: 1, hours: 12.5 },
    ])

    const r = await loadProjectPlReport(PERIOD)

    expect(r.rows[0].unpulledTimesheetHours).toBe(12.5)
    expect(r.rows[0].unpulledTimesheetCount).toBe(1)
    expect(r.rows[0].totalCost).toBe(0)
  })
})

describe("loadProjectPlForProject — kontrak detail proyek F-2026-10-21-029", () => {
  it("proyek tidak ada -> null tanpa query dokumen", async () => {
    mocks.prismaMock.project.findFirst.mockResolvedValue(null)

    await expect(loadProjectPlForProject(404)).resolves.toBeNull()
    expect(mocks.prismaMock.salesInvoice.findMany).not.toHaveBeenCalled()
  })

  it("satu proyek: builder sama dipakai (ProductionCost + dedup jembatan)", async () => {
    const p = mocks.prismaMock
    const shared = {
      id: 5, projectId: 1, quotationId: 100, status: "posted",
      subtotal: 20_000_000, discount: 0, deletedAt: null,
    }
    p.salesInvoice.findMany
      .mockResolvedValueOnce([shared])
      .mockResolvedValueOnce([shared])
    p.productionCost.findMany.mockResolvedValue([
      { workOrderId: 10, amount: 5_000_000, sourceTimesheetId: null, purchaseOrderId: null },
    ])

    const r = await loadProjectPlForProject(1)

    expect(r?.revenue).toBe(20_000_000)
    expect(r?.productionCost).toBe(5_000_000)
    expect(r?.profit).toBe(15_000_000)
  })
})

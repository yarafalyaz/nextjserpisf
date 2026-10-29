import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Loader read-model Estimasi vs Aktual (F-2026-10-20-04).
 *
 * Builder pure sudah terkunci di job-estimate-vs-actual.test.ts; yang dijaga
 * di sini adalah rantai datanya: invoice dikumpulkan dari TIGA jembatan
 * (quotationId langsung, salesOrderId lewat SalesOrder, projectId lewat
 * WorkOrder.projectId) lalu di-dedup per id, disaring isBilledInvoice
 * (draft/cancelled tak terhitung), biaya ProductionCost langsung + via PO
 * terhitung sekali per baris, dan pekerjaan tanpa penawaran disetujui
 * tampil tanpa estimasi (null, bukan nol).
 */

const mocks = await vi.hoisted(async () => (await import("./job-estimate-vs-actual-test-utils")).createJobEstimateMocks())

vi.mock("@/lib/db/prisma", () => mocks.prismaModule())

import { loadJobEstimateVsActual } from "../job-estimate-vs-actual-data"
import { JOB_ESTIMATE_PERIOD as PERIOD, jobEstimateWo as wo, jobEstimateInv as inv } from "./job-estimate-vs-actual-test-utils"

beforeEach(() => {
  vi.clearAllMocks()
  mocks.prismaMock.workOrder.findMany.mockResolvedValue([wo()])
  mocks.prismaMock.salesOrder.findMany.mockResolvedValue([])
  mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([])
  mocks.prismaMock.productionCost.findMany.mockResolvedValue([])
})

describe("loadJobEstimateVsActual — rantai loader F-2026-10-20-04", () => {
  it("tanpa pekerjaan pada periode: hasil kosong tanpa query lanjutan", async () => {
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([])

    const r = await loadJobEstimateVsActual(PERIOD)

    expect(r.estimate.jobCount).toBe(0)
    expect(mocks.prismaMock.salesInvoice.findMany).not.toHaveBeenCalled()
    expect(mocks.prismaMock.productionCost.findMany).not.toHaveBeenCalled()
  })

  it("invoice draft/cancelled tidak terhitung ditagih; posted terhitung", async () => {
    mocks.prismaMock.salesInvoice.findMany.mockResolvedValue([
      inv({ id: 1, status: "draft", grandTotal: 99_000_000 }),
      inv({ id: 2, status: "cancelled", grandTotal: 88_000_000 }),
      inv({ id: 3, status: "posted", grandTotal: 40_000_000 }),
    ])

    const r = await loadJobEstimateVsActual(PERIOD)

    expect(r.estimate.rows[0].billedAmount).toBe(40_000_000)
    expect(r.estimate.rows[0].billingVariance).toBe(-60_000_000)
    expect(r.estimate.rows[0].unbilled).toBe(false)
  })

  it("invoice sama dari jembatan langsung + salesOrder terhitung SEKALI", async () => {
    const shared = inv({ id: 7, grandTotal: 40_000_000 })
    mocks.prismaMock.salesOrder.findMany.mockResolvedValue([{ id: 3, quotationId: 9 }])
    // Promise.all: direct, project (projectIds kosong -> resolve []), lalu viaSalesOrder sesudahnya.
    // salesInvoice dipanggil: direct (1), viaSalesOrder (2). Project dilewati karena projectIds kosong.
    mocks.prismaMock.salesInvoice.findMany
      .mockResolvedValueOnce([shared])
      .mockResolvedValueOnce([shared, inv({ id: 8, quotationId: null, salesOrderId: 3, grandTotal: 25_000_000 })])

    const r = await loadJobEstimateVsActual(PERIOD)

    expect(r.estimate.rows[0].billedAmount).toBe(65_000_000)
    expect(r.estimate.rows[0].billingVariance).toBe(-35_000_000)
  })

  it("invoice project-linked teratribusi ke pekerjaan pertama proyek itu", async () => {
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      wo({ id: 1, documentNo: "WO-0001", projectId: 5 }),
      wo({ id: 2, documentNo: "WO-0002", date: new Date("2026-10-06T00:00:00"), projectId: 5, quotationId: null, quotation: null }),
    ])
    // direct: quotation 9 -> invoice posted; project: projectId 5 -> invoice bersama
    mocks.prismaMock.salesInvoice.findMany
      .mockResolvedValueOnce([inv({ id: 1, grandTotal: 10_000_000 })])
      .mockResolvedValueOnce([inv({ id: 2, quotationId: null, projectId: 5, grandTotal: 30_000_000 })])

    const r = await loadJobEstimateVsActual(PERIOD)

    expect(r.estimate.rows[0].billedAmount).toBe(40_000_000)
    expect(r.estimate.rows[1].billedAmount).toBe(0)
  })

  it("biaya langsung + via ProductionOrder terhitung sekali per baris (10+5=15)", async () => {
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      wo({ productionOrders: [{ id: 50 }] }),
    ])
    mocks.prismaMock.productionCost.findMany.mockResolvedValue([
      { workOrderId: 1, amount: 10_000_000, productionOrder: null },
      { workOrderId: null, amount: 5_000_000, productionOrder: { workOrderId: 1 } },
      { workOrderId: null, amount: 7_000_000, productionOrder: null },
    ])

    const r = await loadJobEstimateVsActual(PERIOD)

    expect(r.estimate.rows[0].actualCost).toBe(15_000_000)
    expect(r.estimate.rows[0].actualMargin).toBe(-15_000_000)
  })

  it("tanpa penawaran disetujui: estimasi null, selisih null (bukan nol)", async () => {
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      wo({ quotation: { status: "draft", grandTotal: 100_000_000 } }),
    ])
    mocks.prismaMock.productionCost.findMany.mockResolvedValue([
      { workOrderId: 1, amount: 5_000_000, productionOrder: null },
    ])

    const r = await loadJobEstimateVsActual(PERIOD)

    expect(r.estimate.rows[0].estimateAmount).toBeNull()
    expect(r.estimate.rows[0].billingVariance).toBeNull()
    expect(r.estimate.rows[0].noApprovedEstimate).toBe(true)
    expect(r.estimate.withoutEstimate).toBe(1)
    expect(r.estimate.totals.estimate).toBe(0)
  })

  it("dedup lintas TIGA jembatan: invoice sama via quotation+SO+project terhitung sekali, ke WO pertama", async () => {
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      wo({ id: 1, documentNo: "WO-0001", projectId: 5 }),
      wo({ id: 2, documentNo: "WO-0002", date: new Date("2026-10-06T00:00:00"), projectId: 5, quotationId: 10, quotation: { status: "accepted", grandTotal: 50_000_000 } }),
    ])
    mocks.prismaMock.salesOrder.findMany.mockResolvedValue([{ id: 3, quotationId: 9 }])
    const shared = inv({ id: 7, quotationId: 9, salesOrderId: 3, projectId: 5, grandTotal: 40_000_000 })
    // Urutan panggilan loader: direct(quotation), project, lalu viaSalesOrder.
    mocks.prismaMock.salesInvoice.findMany
      .mockResolvedValueOnce([shared])
      .mockResolvedValueOnce([shared])
      .mockResolvedValueOnce([shared])

    const r = await loadJobEstimateVsActual(PERIOD)

    // Sekali saja (bukan 3×40jt), dan ke WO pertama menurut urutan tanggal.
    expect(r.estimate.rows[0].billedAmount).toBe(40_000_000)
    expect(r.estimate.rows[1].billedAmount).toBe(0)
  })

  it("costEstimate WO terbaca; WO tanpa costEstimate = null (bukan nol karangan)", async () => {
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      wo({ id: 1, costEstimate: { totalEstimate: 75_000_000 } }),
      wo({ id: 2, documentNo: "WO-0002", date: new Date("2026-10-06T00:00:00"), quotationId: null, quotation: null, costEstimate: null }),
    ])

    const r = await loadJobEstimateVsActual(PERIOD)

    expect(r.estimate.rows[0].costEstimate).toBe(75_000_000)
    expect(r.estimate.rows[1].costEstimate).toBeNull()
  })

  it("penawaran disetujui tanpa invoice: unbilled, selisih = -estimasi", async () => {
    const r = await loadJobEstimateVsActual(PERIOD)

    expect(r.estimate.rows[0].billedAmount).toBe(0)
    expect(r.estimate.rows[0].unbilled).toBe(true)
    expect(r.estimate.rows[0].billingVariance).toBe(-100_000_000)
    expect(r.estimate.unbilledCount).toBe(1)
  })
})

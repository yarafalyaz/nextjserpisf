import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Antrean "Job Selesai Belum Ditutup" (F-2026-10-24-097-S S2).
 * Yang dijaga: hanya status completed tampil (closed/cancelled/
 * in_progress hilang — AC-CLOSE-2), checklist C1-C6 menahan
 * `readyToClose` dengan dokumen/nominal penahan disebut, C7/C8 manual
 * tidak pernah menahan, tanggal completed = endDate dengan fallback
 * updatedAt berlabel (Q-CLOSE-3), dan loader query massal baca-saja.
 */

const mocks = vi.hoisted(() => ({
  prismaMock: {
    systemSetting: { findFirst: vi.fn() },
    workOrder: { findMany: vi.fn() },
    productionOrder: { findMany: vi.fn() },
    materialIssue: { findMany: vi.fn() },
    productionCost: { findMany: vi.fn() },
    purchaseOrder: { findMany: vi.fn() },
    timesheet: { findMany: vi.fn() },
    nonconformance: { count: vi.fn() },
    qcInspection: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/db/prisma", () => ({ prisma: mocks.prismaMock }))

import { getWorkshopCloseoutQueue } from "../workshop-closeout-queue-data"
import {
  buildWorkshopCloseoutQueue,
  WORKSHOP_CLOSEOUT_QUEUE_TITLE,
  WORKSHOP_CLOSEOUT_QUEUE_NOTICE_TEXT,
  type CloseoutQueueJobInput,
} from "../workshop-closeout-queue"

const AS_OF = new Date("2026-10-24T00:00:00Z")
const daysAgo = (days: number) => new Date(AS_OF.getTime() - days * 86_400_000)

import { closeoutJobInput } from "@/components/reports/__tests__/workshop-closeout-test-fixtures"

function job(over: Partial<CloseoutQueueJobInput>): CloseoutQueueJobInput {
  return closeoutJobInput(AS_OF, {
    slug: null,
    documentNo: "WO-1",
    endDate: daysAgo(10),
    updatedAt: daysAgo(2),
    customerName: "Budi",
    plateNumber: "B1234CD",
    vehicleLabel: "Avanza",
    qcDetail: "Inspeksi akhir terakhir passed.",
    manual: {
      purchaseOrderCount: 0,
      purchaseOrdersWithoutBillCount: 0,
      vendorBillCount: 0,
      unpulledTimesheetCount: 0,
      c7Detail: "manual C7",
      c8Detail: "manual C8",
    },
    ...over,
  })
}

describe("konstanta kata verbatim antrean", () => {
  it("judul + notice ter-eksport apa adanya", () => {
    expect(WORKSHOP_CLOSEOUT_QUEUE_TITLE).toBe("Job Selesai Belum Ditutup")
    expect(WORKSHOP_CLOSEOUT_QUEUE_NOTICE_TEXT).toContain("baca-saja")
    expect(WORKSHOP_CLOSEOUT_QUEUE_NOTICE_TEXT).toContain("C7-C8")
  })
})

describe("buildWorkshopCloseoutQueue", () => {
  it("AC-CLOSE-2: hanya completed tampil; closed/cancelled/in_progress hilang", () => {
    const r = buildWorkshopCloseoutQueue({
      asOf: AS_OF,
      jobs: [
        job({ id: 1, documentNo: "WO-1", status: "completed" }),
        job({ id: 2, documentNo: "WO-2", status: "closed" }),
        job({ id: 3, documentNo: "WO-3", status: "cancelled" }),
        job({ id: 4, documentNo: "WO-4", status: "in_progress" }),
      ],
    })
    expect(r.totalJobs).toBe(1)
    expect(r.jobs.map((j) => j.code)).toEqual(["WO-1"])
  })

  it("Q-CLOSE-3: completedAt dari endDate; legacy tanpa endDate jatuh ke updatedAt berlabel", () => {
    const r = buildWorkshopCloseoutQueue({
      asOf: AS_OF,
      jobs: [
        job({ id: 1, documentNo: "WO-1", endDate: daysAgo(40), updatedAt: daysAgo(1) }),
        job({ id: 2, documentNo: "WO-2", endDate: null, updatedAt: daysAgo(5) }),
      ],
    })
    const wo1 = r.jobs.find((j) => j.code === "WO-1")!
    const wo2 = r.jobs.find((j) => j.code === "WO-2")!
    expect(wo1.completedAtSource).toBe("endDate")
    expect(wo1.ageDays).toBe(40)
    expect(wo1.ageBucket).toBe("d31_60")
    expect(wo2.completedAtSource).toBe("updatedAt")
    expect(wo2.ageDays).toBe(5)
  })

  it("WO bersih siap tutup; C1-C6 masing-masing menahan dan menyebut dokumen/nominal", () => {
    const clean = buildWorkshopCloseoutQueue({ asOf: AS_OF, jobs: [job({})] })
    expect(clean.jobs[0].readyToClose).toBe(true)
    expect(clean.readyCount).toBe(1)

    const blocked = buildWorkshopCloseoutQueue({
      asOf: AS_OF,
      jobs: [
        job({
          openProductionOrderCount: 1,
          firstOpenProductionOrder: { id: 9, documentNo: "PO-9", status: "in_progress" },
          openMaterialIssueCount: 1,
          firstOpenMaterialIssue: { id: 8, documentNo: "MI-8", status: "draft" },
          unpostedCostCount: 1,
          firstUnpostedCostId: 77,
          childWipResidualCount: 1,
          firstChildWipResidual: { id: 9, documentNo: "PO-9", totalActualCost: 0.01 },
          qcBlocked: true,
          qcDetail: "Masih ada 1 NCR terbuka.",
          periodClosed: true,
          periodLockDate: daysAgo(1),
        }),
      ],
    })
    const row = blocked.jobs[0]
    expect(row.readyToClose).toBe(false)
    expect(row.blockers).toHaveLength(6)
    expect(row.c1.detail).toContain("PO-9")
    expect(row.c2.detail).toContain("MI-8")
    expect(row.c3.detail).toContain("#77")
    expect(row.c4.detail).toContain("Rp0.01")
    expect(blocked.blockedCount).toBe(1)
  })

  it("C5 null (QC belum dinilai) dan C7/C8 manual tidak menahan tutup", () => {
    const r = buildWorkshopCloseoutQueue({
      asOf: AS_OF,
      jobs: [
        job({
          qcBlocked: null,
          qcDetail: "Belum ada inspeksi akhir (belum dinilai).",
          manual: {
            purchaseOrderCount: 2,
            purchaseOrdersWithoutBillCount: 2,
            vendorBillCount: 0,
            unpulledTimesheetCount: 3,
            c7Detail: "2 PO belum punya tagihan.",
            c8Detail: "3 lembar waktu belum ditarik.",
          },
        }),
      ],
    })
    expect(r.jobs[0].c5.passed).toBeNull()
    expect(r.jobs[0].c7.passed).toBeNull()
    expect(r.jobs[0].c8.passed).toBeNull()
    expect(r.jobs[0].readyToClose).toBe(true)
  })

  it("PO: C4 sisa WIP Rp0,01 menahan; selesai penuh + WIP nol lolos", () => {
    const po = (over: Partial<CloseoutQueueJobInput>) =>
      job({
        kind: "production_order",
        id: 5,
        documentNo: "PO-5",
        qty: 10,
        completedQty: 10,
        totalActualCost: 0,
        customerName: null,
        plateNumber: null,
        vehicleLabel: null,
        productName: "Bumper",
        workOrderDocumentNo: "WO-1",
        workOrderId: 1,
        ...over,
      })
    const sisa = buildWorkshopCloseoutQueue({ asOf: AS_OF, jobs: [po({ totalActualCost: 0.01 })] })
    expect(sisa.jobs[0].c4.passed).toBe(false)
    expect(sisa.jobs[0].c4.detail).toContain("Rp0.01")
    const parsial = buildWorkshopCloseoutQueue({ asOf: AS_OF, jobs: [po({ completedQty: 4 })] })
    expect(parsial.jobs[0].c4.passed).toBe(false)
    const bersih = buildWorkshopCloseoutQueue({ asOf: AS_OF, jobs: [po({})] })
    expect(bersih.jobs[0].readyToClose).toBe(true)
  })

  it("builder murni: replay input sama menghasilkan data sama, input tidak bermutasi", () => {
    const jobs = [job({ id: 2, documentNo: "WO-2" }), job({ id: 1, documentNo: "WO-1", endDate: daysAgo(50) })]
    const a = buildWorkshopCloseoutQueue({ asOf: AS_OF, jobs })
    const b = buildWorkshopCloseoutQueue({ asOf: AS_OF, jobs })
    expect(a).toEqual(b)
    expect(jobs.map((j) => j.id)).toEqual([2, 1])
    // Urutan tampil: umur tertua dulu.
    expect(a.jobs.map((j) => j.code)).toEqual(["WO-1", "WO-2"])
    expect(a.buckets.reduce((s, bucket) => s + bucket.jobCount, 0)).toBe(2)
  })
})

describe("getWorkshopCloseoutQueue (loader)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.prismaMock.systemSetting.findFirst.mockResolvedValue({ periodLockDate: null })
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([])
    mocks.prismaMock.productionOrder.findMany.mockResolvedValue([])
    mocks.prismaMock.materialIssue.findMany.mockResolvedValue([])
    mocks.prismaMock.productionCost.findMany.mockResolvedValue([])
    mocks.prismaMock.purchaseOrder.findMany.mockResolvedValue([])
    mocks.prismaMock.timesheet.findMany.mockResolvedValue([])
    mocks.prismaMock.nonconformance.count.mockResolvedValue(0)
    mocks.prismaMock.qcInspection.findMany.mockResolvedValue([{ status: "passed" }])
  })

  it("AC-CLOSE-2 loader: query hanya status completed; WO completed tampil, closed tidak diminta", async () => {
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      {
        id: 1, slug: null, documentNo: "WO-1", status: "completed",
        endDate: daysAgo(12), updatedAt: daysAgo(12),
        customer: { name: "Budi" },
        customerVehicle: { plateNumber: "B1", vehicle: { name: "Avanza", year: 2020, variant: { name: "G" } } },
      },
    ])
    const r = await getWorkshopCloseoutQueue(AS_OF)
    expect(mocks.prismaMock.workOrder.findMany.mock.calls[0][0].where).toEqual({ status: "completed" })
    expect(mocks.prismaMock.productionOrder.findMany.mock.calls[0][0].where).toEqual({ status: "completed" })
    expect(r.jobs).toHaveLength(1)
    expect(r.jobs[0]).toMatchObject({
      kind: "work_order", code: "WO-1", customerName: "Budi", plateNumber: "B1",
      completedAtSource: "endDate", ageDays: 12, readyToClose: true,
    })
    expect(r.jobs[0].vehicleLabel).toContain("Avanza")
  })

  it("loader merakit penahan C1/C2/C3 + bukti C7/C8 dari query massal", async () => {
    mocks.prismaMock.workOrder.findMany.mockResolvedValue([
      {
        id: 7, slug: null, documentNo: "WO-7", status: "completed",
        endDate: daysAgo(3), updatedAt: daysAgo(3),
        customer: { name: "Sari" }, customerVehicle: null,
      },
    ])
    mocks.prismaMock.productionOrder.findMany
      .mockResolvedValueOnce([]) // PO completed antrean
      .mockResolvedValueOnce([
        { id: 9, documentNo: "PO-9", status: "in_progress", workOrderId: 7, totalActualCost: 100 },
      ]) // anak WO
    mocks.prismaMock.materialIssue.findMany.mockResolvedValue([
      { id: 8, documentNo: "MI-8", status: "draft", workOrderId: 7 },
    ])
    mocks.prismaMock.productionCost.findMany.mockResolvedValue([
      { id: 77, workOrderId: 7, productionOrder: null },
    ])
    mocks.prismaMock.purchaseOrder.findMany.mockResolvedValue([
      { id: 21, workOrderId: 7, vendorBills: [] },
    ])
    mocks.prismaMock.timesheet.findMany.mockResolvedValue([{ id: 31, workOrderId: 7 }])

    const r = await getWorkshopCloseoutQueue(AS_OF)
    const row = r.jobs[0]
    expect(row.readyToClose).toBe(false)
    expect(row.c1.detail).toContain("PO-9")
    expect(row.c2.detail).toContain("MI-8")
    expect(row.c3.detail).toContain("#77")
    expect(row.c7.detail).toContain("belum punya tagihan")
    expect(row.c8.detail).toContain("belum ditarik")
  })
})

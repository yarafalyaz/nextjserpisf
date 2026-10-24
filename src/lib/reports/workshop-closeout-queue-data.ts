/**
 * Loader server-only antrean "Job Selesai Belum Ditutup"
 * (F-2026-10-24-097-S S2). Baca-saja: query massal per sumber (tanpa
 * N+1), tanpa mutasi, tanpa jurnal. Checklist C1-C8 dirakit di builder
 * murni `workshop-closeout-queue.ts` dari fakta yang sama dengan yang
 * ditegakkan aksi tutup WO/PO di server — loader
 * TIDAK menggantikan guard tutup; balapan biaya di antara antrean dan
 * klik tutup tetap ditolak aksi tutup existing.
 *
 * Q-CLOSE-3: `completedAt` = `endDate` (ditulis tx penyelesaian), jatuh
 * ke `updatedAt` berlabel pada baris legacy tanpa endDate.
 * C5 mengikuti semantik qc.service: NCR terbuka (open/rework/rejected)
 * atau inspeksi final terakhir bukan `passed` menahan; tanpa catatan
 * QC sama sekali = belum dinilai (null), bukan lolos karangan.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildWorkshopCloseoutQueue,
  type CloseoutManualEvidence,
  type CloseoutQueueJobInput,
  type WorkshopCloseoutQueue,
} from "@/lib/reports/workshop-closeout-queue"

const OPEN_NCR_STATUSES = ["open", "rework", "rejected"] as const
const CHILD_DONE_STATUSES: readonly string[] = ["completed", "cancelled", "closed"]

function groupBy<T>(rows: readonly T[], keyOf: (row: T) => number | null | undefined): Map<number, T[]> {
  const map = new Map<number, T[]>()
  for (const row of rows) {
    const key = keyOf(row)
    if (key == null) continue
    const list = map.get(key)
    if (list) list.push(row)
    else map.set(key, [row])
  }
  return map
}

async function qcState(
  referenceType: "WorkOrder" | "ProductionOrder",
  referenceId: number,
  label: string,
): Promise<{ qcBlocked: boolean | null; qcDetail: string }> {
  const [openNcr, finals] = await Promise.all([
    prisma.nonconformance.count({
      where: { referenceType, referenceId, status: { in: [...OPEN_NCR_STATUSES] } },
    }),
    prisma.qcInspection.findMany({
      where: { referenceType, referenceId, inspectionType: "final" },
      select: { status: true },
      orderBy: { createdAt: "desc" },
      take: 1,
    }),
  ])
  if (openNcr > 0) {
    return { qcBlocked: true, qcDetail: `Masih ada ${openNcr} nonconformance (NCR) terbuka pada ${label}.` }
  }
  if (finals.length > 0 && finals[0].status !== "passed") {
    return { qcBlocked: true, qcDetail: `Inspeksi akhir ${label} berstatus '${finals[0].status}', harus 'passed'.` }
  }
  if (finals.length === 0) {
    return { qcBlocked: null, qcDetail: `Belum ada inspeksi akhir tercatat untuk ${label} (QC opt-in; belum dinilai).` }
  }
  return { qcBlocked: false, qcDetail: `Inspeksi akhir terakhir ${label} passed, tanpa NCR terbuka.` }
}

export async function getWorkshopCloseoutQueue(
  asOf: Date = new Date(),
): Promise<WorkshopCloseoutQueue> {
  const settings = await prisma.systemSetting.findFirst({ select: { periodLockDate: true } })
  const periodLockDate = settings?.periodLockDate ?? null
  // Pola assertPeriodOpen: hari asOf pada/sebelum hari kunci = tertutup.
  const periodClosed =
    periodLockDate != null && asOf.getTime() <= new Date(periodLockDate).setHours(23, 59, 59, 999)

  const [workOrders, productionOrders] = await Promise.all([
    prisma.workOrder.findMany({
      where: { status: "completed" },
      select: {
        id: true, slug: true, documentNo: true, status: true, endDate: true, updatedAt: true,
        customer: { select: { name: true } },
        customerVehicle: {
          select: {
            plateNumber: true,
            vehicle: { select: { name: true, year: true, variant: { select: { name: true } } } },
          },
        },
      },
      orderBy: [{ endDate: "asc" }, { id: "asc" }],
    }),
    prisma.productionOrder.findMany({
      where: { status: "completed" },
      select: {
        id: true, slug: true, documentNo: true, status: true, endDate: true, updatedAt: true,
        qty: true, completedQty: true, totalActualCost: true, workOrderId: true,
        product: { select: { name: true } },
        workOrder: { select: { documentNo: true } },
      },
      orderBy: [{ endDate: "asc" }, { id: "asc" }],
    }),
  ])

  const woIds = workOrders.map((wo) => wo.id)
  const poIds = productionOrders.map((po) => po.id)
  const hasWo = woIds.length > 0
  const hasPo = poIds.length > 0

  const [childPos, openMis, unpostedWoCosts, purchaseOrders, timesheets, unpostedPoCosts] =
    await Promise.all([
      hasWo
        ? prisma.productionOrder.findMany({
            where: { workOrderId: { in: woIds } },
            select: { id: true, documentNo: true, status: true, workOrderId: true, totalActualCost: true },
            orderBy: { id: "asc" },
          })
        : Promise.resolve([] as { id: number; documentNo: string; status: string; workOrderId: number | null; totalActualCost: unknown }[]),
      hasWo
        ? prisma.materialIssue.findMany({
            where: { workOrderId: { in: woIds }, status: { in: ["draft", "processing"] } },
            select: { id: true, documentNo: true, status: true, workOrderId: true },
            orderBy: { id: "asc" },
          })
        : Promise.resolve([] as { id: number; documentNo: string; status: string; workOrderId: number | null }[]),
      hasWo
        ? prisma.productionCost.findMany({
            where: {
              postedAt: null,
              OR: [{ workOrderId: { in: woIds } }, { productionOrder: { workOrderId: { in: woIds } } }],
            },
            select: { id: true, workOrderId: true, productionOrder: { select: { workOrderId: true } } },
            orderBy: { id: "asc" },
          })
        : Promise.resolve([] as { id: number; workOrderId: number | null; productionOrder: { workOrderId: number | null } | null }[]),
      hasWo
        ? prisma.purchaseOrder.findMany({
            where: { workOrderId: { in: woIds }, deletedAt: null },
            select: { id: true, workOrderId: true, vendorBills: { where: { deletedAt: null }, select: { id: true } } },
          })
        : Promise.resolve([] as { id: number; workOrderId: number | null; vendorBills: { id: number }[] }[]),
      hasWo
        ? prisma.timesheet.findMany({
            where: { workOrderId: { in: woIds } },
            select: { id: true, workOrderId: true },
          })
        : Promise.resolve([] as { id: number; workOrderId: number | null }[]),
      hasPo
        ? prisma.productionCost.findMany({
            where: { postedAt: null, productionOrderId: { in: poIds } },
            select: { id: true, productionOrderId: true },
            orderBy: { id: "asc" },
          })
        : Promise.resolve([] as { id: number; productionOrderId: number | null }[]),
    ])

  const pulledCosts = hasWo
    ? await prisma.productionCost.findMany({
        where: { sourceTimesheetId: { not: null }, workOrderId: { in: woIds } },
        select: { sourceTimesheetId: true, workOrderId: true },
      })
    : []

  const childPoByWo = groupBy(childPos, (r) => r.workOrderId)
  const openMiByWo = groupBy(openMis, (r) => r.workOrderId)
  const purchaseByWo = groupBy(purchaseOrders, (r) => r.workOrderId)
  const timesheetByWo = groupBy(timesheets, (r) => r.workOrderId)
  const unpostedPoByPo = groupBy(unpostedPoCosts, (r) => r.productionOrderId)

  const unpostedWoByWo = new Map<number, number[]>()
  for (const cost of unpostedWoCosts) {
    const key = cost.workOrderId ?? cost.productionOrder?.workOrderId
    if (key == null) continue
    const list = unpostedWoByWo.get(key)
    if (list) list.push(cost.id)
    else unpostedWoByWo.set(key, [cost.id])
  }
  const pulledByWo = new Map<number, Set<number>>()
  for (const cost of pulledCosts) {
    if (cost.workOrderId == null || cost.sourceTimesheetId == null) continue
    const set = pulledByWo.get(cost.workOrderId) ?? new Set<number>()
    set.add(cost.sourceTimesheetId)
    pulledByWo.set(cost.workOrderId, set)
  }

  const manualFor = (woId: number): CloseoutManualEvidence => {
    const pos = purchaseByWo.get(woId) ?? []
    const billTotal = pos.reduce((sum, po) => sum + po.vendorBills.length, 0)
    const withoutBill = pos.filter((po) => po.vendorBills.length === 0).length
    const sheets = timesheetByWo.get(woId) ?? []
    const pulled = pulledByWo.get(woId) ?? new Set<number>()
    const unpulled = sheets.filter((t) => !pulled.has(t.id)).length
    return {
      purchaseOrderCount: pos.length,
      purchaseOrdersWithoutBillCount: withoutBill,
      vendorBillCount: billTotal,
      unpulledTimesheetCount: unpulled,
      c7Detail:
        pos.length === 0
          ? "Tidak ada PO pembelian tertaut perintah kerja ini; periksa manual apakah ada tagihan vendor/subkontrak di luar PO."
          : `${pos.length} PO pembelian tertaut, ${billTotal} tagihan vendor tercatat, ${withoutBill} PO belum punya tagihan. Periksa manual kelengkapannya.`,
      c8Detail:
        sheets.length === 0
          ? "Tidak ada lembar waktu tertaut perintah kerja ini."
          : `${sheets.length} lembar waktu tertaut, ${unpulled} belum ditarik menjadi biaya produksi. Periksa manual apakah perlu ditarik.`,
    }
  }

  const jobs: CloseoutQueueJobInput[] = []

  for (const wo of workOrders) {
    const children = childPoByWo.get(wo.id) ?? []
    const openChildren = children.filter((po) => !CHILD_DONE_STATUSES.includes(po.status))
    const wipChildren = children
      .filter((po) => po.status === "completed" && Number(po.totalActualCost) !== 0)
      .map((po) => ({ id: po.id, documentNo: po.documentNo, totalActualCost: Number(po.totalActualCost) }))
    const unpostedIds = unpostedWoByWo.get(wo.id) ?? []
    const openMisForWo = openMiByWo.get(wo.id) ?? []
    const qc = await qcState("WorkOrder", wo.id, "perintah kerja ini")
    const vehicle = wo.customerVehicle
    jobs.push({
      kind: "work_order",
      id: wo.id,
      slug: wo.slug,
      documentNo: wo.documentNo,
      status: wo.status,
      endDate: wo.endDate,
      updatedAt: wo.updatedAt,
      customerName: wo.customer?.name ?? null,
      plateNumber: vehicle?.plateNumber ?? null,
      vehicleLabel: vehicle
        ? [vehicle.vehicle?.name, vehicle.vehicle?.variant?.name, vehicle.vehicle?.year].filter(Boolean).join(" ") || null
        : null,
      productName: null,
      workOrderDocumentNo: null,
      workOrderId: null,
      openProductionOrderCount: openChildren.length,
      firstOpenProductionOrder: openChildren[0]
        ? { id: openChildren[0].id, documentNo: openChildren[0].documentNo, status: openChildren[0].status }
        : null,
      openMaterialIssueCount: openMisForWo.length,
      firstOpenMaterialIssue: openMisForWo[0]
        ? { id: openMisForWo[0].id, documentNo: openMisForWo[0].documentNo, status: openMisForWo[0].status }
        : null,
      unpostedCostCount: unpostedIds.length,
      firstUnpostedCostId: unpostedIds[0] ?? null,
      qty: null,
      completedQty: null,
      totalActualCost: null,
      childWipResidualCount: wipChildren.length,
      firstChildWipResidual: wipChildren[0] ?? null,
      qcBlocked: qc.qcBlocked,
      qcDetail: qc.qcDetail,
      periodClosed,
      periodLockDate,
      manual: manualFor(wo.id),
    })
  }

  for (const po of productionOrders) {
    let qc = await qcState("ProductionOrder", po.id, "perintah produksi ini")
    if (qc.qcBlocked !== true && po.workOrderId != null) {
      const qcWo = await qcState("WorkOrder", po.workOrderId, "perintah kerja induk")
      if (qcWo.qcBlocked === true) qc = qcWo
      else if (qc.qcBlocked == null && qcWo.qcBlocked === false) qc = qcWo
    }
    const unposted = unpostedPoByPo.get(po.id) ?? []
    jobs.push({
      kind: "production_order",
      id: po.id,
      slug: po.slug,
      documentNo: po.documentNo,
      status: po.status,
      endDate: po.endDate,
      updatedAt: po.updatedAt,
      customerName: null,
      plateNumber: null,
      vehicleLabel: null,
      productName: po.product?.name ?? null,
      workOrderDocumentNo: po.workOrder?.documentNo ?? null,
      workOrderId: po.workOrderId,
      openProductionOrderCount: 0,
      firstOpenProductionOrder: null,
      openMaterialIssueCount: 0,
      firstOpenMaterialIssue: null,
      unpostedCostCount: unposted.length,
      firstUnpostedCostId: unposted[0]?.id ?? null,
      qty: Number(po.qty),
      completedQty: Number(po.completedQty),
      totalActualCost: Number(po.totalActualCost),
      childWipResidualCount: 0,
      firstChildWipResidual: null,
      qcBlocked: qc.qcBlocked,
      qcDetail: qc.qcDetail,
      periodClosed,
      periodLockDate,
      manual: {
        purchaseOrderCount: 0,
        purchaseOrdersWithoutBillCount: 0,
        vendorBillCount: 0,
        unpulledTimesheetCount: 0,
        c7Detail: "Periksa manual pada perintah kerja induk.",
        c8Detail: "Periksa manual pada perintah kerja induk.",
      },
    })
  }

  return buildWorkshopCloseoutQueue({ jobs, asOf })
}

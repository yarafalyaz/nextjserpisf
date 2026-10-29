/**
 * Loader read-model estimasi vs aktual per pekerjaan (F-2026-10-20-04).
 *
 * Satu sumber untuk halaman dan PDF, sehingga angka di layar dan di PDF
 * tidak mungkin berbeda. Query dibatasi per periode pekerjaan dan diambil
 * massal lalu digabung di memori — bukan per-pekerjaan (N+1):
 *
 * 1. WorkOrder pada periode (`date`), lengkap dengan pelanggan, kendaraan,
 *    dan penawaran terhubungnya.
 * 2. SalesOrder dari penawaran-penawaran itu (jembatan invoice kedua).
 * 3. SalesInvoice dari tiga jembatan existing — `quotationId` langsung,
 *    `salesOrderId` lewat SalesOrder, `projectId` lewat WorkOrder.projectId —
 *    di-dedup per id invoice (satu invoice bisa terjangkau dua jembatan),
 *    lalu disaring dengan definisi `job-billing-summary`.
 * 4. ProductionCost terikat langsung ke pekerjaan atau lewat perintah
 *    produksinya.
 *
 * Invoice per pekerjaan dipetakan lewat jembatan yang sama: penawaran
 * pekerjaan, pesanan penjualan dari penawaran itu, atau proyek pekerjaan.
 * Satu invoice yang terjangkau dua pekerjaan berbeda (proyek berisi banyak
 * pekerjaan) diatribusikan ke pekerjaan pertama menurut urutan tanggal —
 * aturan deterministik, bukan tebakan proporsional.
 *
 * Penawaran dianggap disetujui pada status accepted/approved/converted —
 * himpunan yang sama yang dipakai jalur penjualan untuk membuka pesanan
 * dan uang muka (sales.actions.ts). Pekerjaan yang penawarannya belum
 * disetujui dilaporkan tanpa estimasi, bukan dengan angka nol.
 */

import { prisma } from "@/lib/db/prisma"
import { isBilledInvoice } from "@/lib/reports/job-billing-summary"
import {
  buildJobEstimateVsActual,
  type JobEstimateVsActualInput,
  type JobEstimateVsActualResult,
} from "@/lib/reports/job-estimate-vs-actual"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import { safeAdd } from "@/lib/utils/math"

const APPROVED_QUOTATION_STATUSES = ["accepted", "approved", "converted"] as const

export interface JobEstimateVsActualReport {
  estimate: JobEstimateVsActualResult
  periodLabel: string
  periodCaption: string
}

function vehicleLabelOf(workOrder: {
  customerVehicle: {
    plateNumber: string | null
    vehicle: { name: string | null } | null
  } | null
}): string | null {
  const cv = workOrder.customerVehicle
  if (!cv) return null
  const parts = [cv.plateNumber, cv.vehicle?.name].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  )
  return parts.length ? parts.join(" · ") : "Kendaraan tanpa plat"
}

export async function loadJobEstimateVsActual(period: {
  start: Date
  end: Date
}): Promise<JobEstimateVsActualReport> {
  const labels = rangePeriodLabels(period)
  const workOrders = await prisma.workOrder.findMany({
    where: { date: { gte: period.start, lte: period.end } },
    select: {
      id: true,
      documentNo: true,
      date: true,
      status: true,
      quotationId: true,
      projectId: true,
      customer: { select: { name: true } },
      customerVehicle: {
        select: { plateNumber: true, vehicle: { select: { name: true } } },
      },
      quotation: { select: { status: true, grandTotal: true } },
      productionOrders: { select: { id: true } },
      costEstimate: { select: { totalEstimate: true } },
    },
    orderBy: [{ date: "asc" }, { documentNo: "asc" }],
  })

  const empty = (): JobEstimateVsActualReport => ({
    estimate: buildJobEstimateVsActual({ jobs: [], start: period.start, end: period.end }),
    ...labels,
  })
  if (workOrders.length === 0) return empty()

  const quotationIds = [
    ...new Set(
      workOrders
        .map((w) => w.quotationId)
        .filter((id): id is number => id !== null),
    ),
  ]
  const projectIds = [
    ...new Set(
      workOrders.map((w) => w.projectId).filter((id): id is number => id !== null),
    ),
  ]
  const workOrderIds = workOrders.map((w) => w.id)
  const productionOrderIds = workOrders.flatMap((w) => w.productionOrders.map((p) => p.id))

  const [salesOrders, directInvoices, projectInvoices, costs] = await Promise.all([
    quotationIds.length
      ? prisma.salesOrder.findMany({
          where: { quotationId: { in: quotationIds }, deletedAt: null },
          select: { id: true, quotationId: true },
        })
      : Promise.resolve([] as { id: number; quotationId: number | null }[]),
    quotationIds.length
      ? prisma.salesInvoice.findMany({
          where: { quotationId: { in: quotationIds }, deletedAt: null },
          select: {
            id: true,
            quotationId: true,
            salesOrderId: true,
            projectId: true,
            status: true,
            grandTotal: true,
            deletedAt: true,
          },
        })
      : Promise.resolve(
          [] as {
            id: number
            quotationId: number | null
            salesOrderId: number | null
            projectId: number | null
            status: string
            grandTotal: unknown
            deletedAt: Date | null
          }[],
        ),
    projectIds.length
      ? prisma.salesInvoice.findMany({
          where: { projectId: { in: projectIds }, deletedAt: null },
          select: {
            id: true,
            quotationId: true,
            salesOrderId: true,
            projectId: true,
            status: true,
            grandTotal: true,
            deletedAt: true,
          },
        })
      : Promise.resolve(
          [] as {
            id: number
            quotationId: number | null
            salesOrderId: number | null
            projectId: number | null
            status: string
            grandTotal: unknown
            deletedAt: Date | null
          }[],
        ),
    prisma.productionCost.findMany({
      where: {
        OR: [
          { workOrderId: { in: workOrderIds } },
          ...(productionOrderIds.length
            ? [{ productionOrderId: { in: productionOrderIds } }]
            : []),
        ],
      },
      select: {
        workOrderId: true,
        amount: true,
        productionOrder: { select: { workOrderId: true } },
      },
    }),
  ])

  const salesOrderIds = salesOrders.map((s) => s.id)
  const viaSalesOrder = salesOrderIds.length
    ? await prisma.salesInvoice.findMany({
        where: { salesOrderId: { in: salesOrderIds }, deletedAt: null },
        select: {
          id: true,
          quotationId: true,
          salesOrderId: true,
          projectId: true,
          status: true,
          grandTotal: true,
          deletedAt: true,
        },
      })
    : []

  // Jembatan invoice -> pekerjaan. Urutan pekerjaan mengikuti urutan query
  // (tanggal, nomor), jadi atribusi invoice bersama deterministik.
  const workOrderByQuotation = new Map<number, number>()
  const workOrdersByProject = new Map<number, number[]>()
  for (const w of workOrders) {
    if (w.quotationId !== null && !workOrderByQuotation.has(w.quotationId)) {
      workOrderByQuotation.set(w.quotationId, w.id)
    }
    if (w.projectId !== null) {
      const list = workOrdersByProject.get(w.projectId) ?? []
      list.push(w.id)
      workOrdersByProject.set(w.projectId, list)
    }
  }
  const workOrderBySalesOrder = new Map<number, number>()
  for (const s of salesOrders) {
    if (s.quotationId === null) continue
    const workOrderId = workOrderByQuotation.get(s.quotationId)
    if (workOrderId !== undefined) workOrderBySalesOrder.set(s.id, workOrderId)
  }

  const invoiceById = new Map<number, (typeof directInvoices)[number]>()
  for (const inv of [...directInvoices, ...viaSalesOrder, ...projectInvoices]) {
    invoiceById.set(inv.id, inv)
  }

  const billedByWorkOrder = new Map<number, number>()
  const billedWorkOrders = new Set<number>()
  for (const inv of invoiceById.values()) {
    if (
      !isBilledInvoice({
        id: inv.id,
        documentNo: "",
        status: String(inv.status),
        grandTotal: Number(inv.grandTotal),
        paidAmount: 0,
        deletedAt: inv.deletedAt,
      })
    ) {
      continue
    }
    const candidates: (number | undefined)[] = [
      inv.quotationId !== null ? workOrderByQuotation.get(inv.quotationId) : undefined,
      inv.salesOrderId !== null ? workOrderBySalesOrder.get(inv.salesOrderId) : undefined,
      ...(inv.projectId !== null ? (workOrdersByProject.get(inv.projectId) ?? []) : []),
    ]
    const workOrderId = candidates.find((id): id is number => id !== undefined)
    if (workOrderId === undefined) continue
    billedByWorkOrder.set(
      workOrderId,
      safeAdd(billedByWorkOrder.get(workOrderId) ?? 0, Number(inv.grandTotal), 2),
    )
    billedWorkOrders.add(workOrderId)
  }

  const costByWorkOrder = new Map<number, number>()
  for (const cost of costs) {
    const workOrderId = cost.workOrderId ?? cost.productionOrder?.workOrderId ?? null
    if (workOrderId === null) continue
    costByWorkOrder.set(workOrderId, safeAdd(costByWorkOrder.get(workOrderId) ?? 0, Number(cost.amount), 2))
  }

  const jobs: JobEstimateVsActualInput[] = workOrders.map((w) => {
    const approved =
      w.quotation !== null &&
      (APPROVED_QUOTATION_STATUSES as readonly string[]).includes(w.quotation.status)
    return {
      id: w.id,
      documentNo: w.documentNo,
      date: w.date,
      status: w.status,
      customerName: w.customer?.name ?? null,
      vehicleLabel: vehicleLabelOf(w),
      estimateAmount: approved ? Number(w.quotation?.grandTotal ?? 0) : null,
      billedAmount: billedByWorkOrder.get(w.id) ?? 0,
      hasBilling: billedWorkOrders.has(w.id),
      actualCost: costByWorkOrder.get(w.id) ?? 0,
      costEstimate: w.costEstimate?.totalEstimate == null ? null : Number(w.costEstimate.totalEstimate),
    }
  })

  return {
    estimate: buildJobEstimateVsActual({ jobs, start: period.start, end: period.end }),
    ...labels,
  }
}

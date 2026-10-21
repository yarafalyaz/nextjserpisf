/**
 * Loader read-model margin job per kendaraan (F-2026-10-21-033).
 *
 * Menggulirkan output builder existing per `customerVehicleId` — tidak
 * ada aturan uang baru di sini (kontrak penuh di header
 * `vehicle-margin.ts`):
 *  (a) Proyek: `loadProjectPlReport(period)` apa adanya; kunci kendaraan
 *      dari `Project.customerVehicleId` (query ringan terpisah karena
 *      loader F-029 hanya membawa plat sebagai label).
 *  (b) WO non-proyek pada periode (`WorkOrder.date`, projectId null):
 *      pendapatan per definisi `job-billing-summary` lewat jembatan
 *      quotation → SalesOrder / quotation langsung (dedup per invoice
 *      id; invoice bersama diatribusikan ke WO pertama urut tanggal —
 *      aturan deterministik loader job-estimate-vs-actual), biaya =
 *      ProductionCost terikat WO atau lewat ProductionOrder-nya.
 *      Invoice ber-projectId tidak dipinjam ke WO non-proyek: ia milik
 *      ember proyek (a) lewat builder F-029. Basis pendapatan = DPP
 *      (subtotal−diskon, vonis BOT 4 Q-033-1 PR #391) — BUKAN grandTotal;
 *      `job-billing-summary` sendiri tidak diubah. MaterialIssue
 *      completed langsung ke WO ditandai `hasUnlinkedMaterial` saja
 *      (Q-033-2), tidak dijumlahkan ke biaya.
 *  (c) Invoice langsung ber-kendaraan pada periode yang tidak terjangkau
 *      jembatan mana pun di atas (quotationId/salesOrderId/projectId
 *      semua null): pendapatan subtotal−diskon saja.
 *
 * Semua query massal per sumber (tanpa N+1 per kendaraan). Periode
 * mengikuti tanggal dokumen sumber builder asal.
 */

import { prisma } from "@/lib/db/prisma"
import { BILLED_INVOICE_STATUSES } from "@/lib/reports/job-billing-summary"
import {
  PROJECT_PL_INVOICE_STATUSES,
} from "@/lib/reports/project-pl"
import { loadProjectPlReport } from "@/lib/reports/project-pl-data"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import {
  buildVehicleMargin,
  type VehicleMarginResult,
} from "@/lib/reports/vehicle-margin"
import { safeSubtract, safeSum } from "@/lib/utils/math"

export type { VehicleMarginResult, VehicleMarginRow } from "@/lib/reports/vehicle-margin"
export { buildVehicleMargin, VEHICLE_MARGIN_LABEL } from "@/lib/reports/vehicle-margin"

export interface VehicleMarginReport extends VehicleMarginResult {
  periodLabel: string
  periodCaption: string
}

const INVOICE_BRIDGE_SELECT = {
  id: true,
  quotationId: true,
  salesOrderId: true,
  projectId: true,
  status: true,
  subtotal: true,
  discount: true,
  deletedAt: true,
} as const

type BridgeInvoice = {
  id: number
  quotationId: number | null
  salesOrderId: number | null
  projectId: number | null
  status: string
  subtotal: unknown
  discount: unknown
  deletedAt: Date | null
}

export async function loadVehicleMarginReport(period: {
  start: Date
  end: Date
}): Promise<VehicleMarginReport> {
  const labels = rangePeriodLabels(period)
  const dateWhere = { date: { gte: period.start, lte: period.end } }

  // (a) Proyek lewat builder tunggal F-029 + kunci kendaraan proyek.
  const projectPl = await loadProjectPlReport(period)
  const projectVehicleById = new Map<number, number | null>()
  if (projectPl.rows.length > 0) {
    const projects = await prisma.project.findMany({
      where: { id: { in: projectPl.rows.map((r) => r.projectId) } },
      select: { id: true, customerVehicleId: true },
    })
    for (const p of projects) projectVehicleById.set(p.id, p.customerVehicleId)
  }
  const projects = projectPl.rows.map((row) => ({
    customerVehicleId: projectVehicleById.get(row.projectId) ?? null,
    vehiclePlate: row.vehiclePlate,
    customerName: row.customerName,
    pl: row,
  }))

  // (b) WO non-proyek pada periode.
  const workOrders = await prisma.workOrder.findMany({
    where: { projectId: null, ...dateWhere },
    select: {
      id: true,
      date: true,
      documentNo: true,
      quotationId: true,
      customerVehicleId: true,
      customer: { select: { name: true } },
      customerVehicle: { select: { plateNumber: true } },
      productionOrders: { select: { id: true } },
    },
    orderBy: [{ date: "asc" }, { documentNo: "asc" }],
  })

  const jobs: {
    workOrderId: number
    customerVehicleId: number | null
    vehiclePlate: string | null
    customerName: string
    billedAmount: number
    actualCost: number
    hasUnlinkedMaterial: boolean
  }[] = []

  if (workOrders.length > 0) {
    const quotationIds = [
      ...new Set(
        workOrders.map((w) => w.quotationId).filter((id): id is number => id !== null),
      ),
    ]
    const workOrderIds = workOrders.map((w) => w.id)
    const productionOrderIds = workOrders.flatMap((w) => w.productionOrders.map((p) => p.id))

    const [salesOrders, quotationInvoices, costs, directMaterialIssues] = await Promise.all([
      quotationIds.length
        ? prisma.salesOrder.findMany({
            where: { quotationId: { in: quotationIds }, deletedAt: null },
            select: { id: true, quotationId: true },
          })
        : Promise.resolve([] as { id: number; quotationId: number | null }[]),
      quotationIds.length
        ? prisma.salesInvoice.findMany({
            where: { quotationId: { in: quotationIds }, deletedAt: null, ...dateWhere },
            select: INVOICE_BRIDGE_SELECT,
          })
        : Promise.resolve([] as BridgeInvoice[]),
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
      // Penanda parsial Q-033-2: keberadaan saja, jumlah tidak dibaca.
      prisma.materialIssue.findMany({
        where: { workOrderId: { in: workOrderIds }, status: "completed" },
        select: { workOrderId: true },
      }),
    ])

    const salesOrderIds = salesOrders.map((s) => s.id)
    const salesOrderInvoices: BridgeInvoice[] = salesOrderIds.length
      ? await prisma.salesInvoice.findMany({
          where: { salesOrderId: { in: salesOrderIds }, deletedAt: null, ...dateWhere },
          select: INVOICE_BRIDGE_SELECT,
        })
      : []

    // Jembatan invoice -> WO. Urutan WO mengikuti query (tanggal, nomor)
    // jadi atribusi invoice bersama deterministik ke WO pertama.
    const workOrderByQuotation = new Map<number, number>()
    for (const w of workOrders) {
      if (w.quotationId !== null && !workOrderByQuotation.has(w.quotationId)) {
        workOrderByQuotation.set(w.quotationId, w.id)
      }
    }
    const workOrderBySalesOrder = new Map<number, number>()
    for (const so of salesOrders) {
      if (so.quotationId === null) continue
      const woId = workOrderByQuotation.get(so.quotationId)
      if (woId !== undefined) workOrderBySalesOrder.set(so.id, woId)
    }

    const billedByWorkOrder = new Map<number, number>()
    const seenInvoiceIds = new Set<number>()
    const billedInvoices: BridgeInvoice[] = [...quotationInvoices, ...salesOrderInvoices]
      .filter(
        (inv) =>
          inv.deletedAt === null &&
          (BILLED_INVOICE_STATUSES as readonly string[]).includes(inv.status),
      )
      .sort((a, b) => a.id - b.id)
    for (const inv of billedInvoices) {
      if (seenInvoiceIds.has(inv.id)) continue
      // Invoice ber-projectId milik ember proyek (a), bukan WO non-proyek.
      if (inv.projectId !== null) continue
      const woId =
        (inv.quotationId !== null ? workOrderByQuotation.get(inv.quotationId) : undefined) ??
        (inv.salesOrderId !== null ? workOrderBySalesOrder.get(inv.salesOrderId) : undefined)
      if (woId === undefined) continue
      seenInvoiceIds.add(inv.id)
      // Basis DPP (Q-033-1): subtotal−diskon, tanpa PPN — bukan grandTotal.
      billedByWorkOrder.set(
        woId,
        safeSum(
          [
            billedByWorkOrder.get(woId) ?? 0,
            safeSubtract(Number(inv.subtotal), Number(inv.discount), 2),
          ],
          2,
        ),
      )
    }

    const costByWorkOrder = new Map<number, number>()
    for (const cost of costs) {
      const woId = cost.workOrderId ?? cost.productionOrder?.workOrderId ?? null
      if (woId === null) continue
      costByWorkOrder.set(woId, (costByWorkOrder.get(woId) ?? 0) + Number(cost.amount))
    }

    const unlinkedMaterialWorkOrderIds = new Set(
      directMaterialIssues
        .map((mi) => mi.workOrderId)
        .filter((id): id is number => id !== null),
    )

    for (const w of workOrders) {
      jobs.push({
        workOrderId: w.id,
        customerVehicleId: w.customerVehicleId,
        vehiclePlate: w.customerVehicle?.plateNumber ?? null,
        customerName: w.customer.name,
        billedAmount: billedByWorkOrder.get(w.id) ?? 0,
        actualCost: costByWorkOrder.get(w.id) ?? 0,
        hasUnlinkedMaterial: unlinkedMaterialWorkOrderIds.has(w.id),
      })
    }
  }

  // (c) Invoice langsung ber-kendaraan tanpa jembatan apa pun.
  const directInvoiceRows = await prisma.salesInvoice.findMany({
    where: {
      customerVehicleId: { not: null },
      quotationId: null,
      salesOrderId: null,
      projectId: null,
      status: { in: [...PROJECT_PL_INVOICE_STATUSES] },
      deletedAt: null,
      ...dateWhere,
    },
    select: {
      id: true,
      customerVehicleId: true,
      subtotal: true,
      discount: true,
      customer: { select: { name: true } },
    },
  })
  // SalesInvoice hanya punya FK customerVehicleId polos (tanpa relasi di
  // schema) — plat diambil query massal terpisah, bukan select relasi.
  const directVehicleIds = [
    ...new Set(
      directInvoiceRows
        .map((inv) => inv.customerVehicleId)
        .filter((id): id is number => id !== null),
    ),
  ]
  const directVehicles = directVehicleIds.length
    ? await prisma.customerVehicle.findMany({
        where: { id: { in: directVehicleIds } },
        select: { id: true, plateNumber: true },
      })
    : []
  const plateByVehicleId = new Map(directVehicles.map((v) => [v.id, v.plateNumber]))
  const directInvoices = directInvoiceRows.map((inv) => ({
    id: inv.id,
    customerVehicleId: inv.customerVehicleId,
    vehiclePlate:
      inv.customerVehicleId !== null
        ? (plateByVehicleId.get(inv.customerVehicleId) ?? null)
        : null,
    customerName: inv.customer.name,
    revenue: safeSubtract(Number(inv.subtotal), Number(inv.discount), 2),
  }))

  return {
    ...buildVehicleMargin({ projects, jobs, directInvoices }),
    ...labels,
  }
}

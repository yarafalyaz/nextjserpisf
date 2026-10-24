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
 *
 * Memo unbilled E129-4 (vonis F-2026-10-24-129-V Putusan 2): himpunan
 * invoice `draft/approved/sent` non-deleted dimuat terpisah dari billed
 * lewat jalur yang sama persis per kelas —
 *  (a) proyek: projectId langsung + quotation WO proyek (semua WO
 *      ber-projectId non-null pada periode, veh/plate/name proyek), muat
 *      di loader ini; `loadProjectPlReport`/`buildProjectPl` TIDAK diubah;
 *  (b) WO non-proyek: quotation → SalesOrder / quotation langsung;
 *  (c) invoice langsung customerVehicleId non-null + quotationId/
 *      salesOrderId/projectId null.
 * Atribusi: invoice ber-projectId -> ember proyek (bukan WO non-proyek);
 * invoice bersama WO -> WO pertama urut (date, documentNo). Dedup global
 * per invoice id ada di builder murni. Periode memo = tanggal invoice
 * (dateWhere existing). Nilai = DPP subtotal−diskon; taxAmount/grandTotal/
 * totalAmount/paidAmount tidak masuk. Memo TIDAK masuk
 * revenue/profit/marginPercent.
 */

import { prisma } from "@/lib/db/prisma"
import { BILLED_INVOICE_STATUSES } from "@/lib/reports/job-billing-summary"
import {
  PROJECT_PL_INVOICE_STATUSES,
} from "@/lib/reports/project-pl"
import { loadProjectPlReport } from "@/lib/reports/project-pl-data"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import {
  UNBILLED_MEMO_STATUSES,
  buildVehicleMargin,
  type VehicleMarginResult,
  type VehicleMarginUnbilledInput,
} from "@/lib/reports/vehicle-margin"
import { safeSubtract, safeSum } from "@/lib/utils/math"

export type { VehicleMarginResult, VehicleMarginRow } from "@/lib/reports/vehicle-margin"
export {
  buildVehicleMargin,
  VEHICLE_MARGIN_LABEL,
  VEHICLE_MARGIN_UNBILLED_LABEL,
  UNBILLED_MEMO_STATUSES,
} from "@/lib/reports/vehicle-margin"

export interface VehicleMarginReport extends VehicleMarginResult {
  periodLabel: string
  periodCaption: string
}

const INVOICE_BRIDGE_SELECT = {
  id: true,
  quotationId: true,
  salesOrderId: true,
  projectId: true,
  customerVehicleId: true,
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
  customerVehicleId: number | null
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

  // Memo unbilled (E129-4): saringan sumber memo, dipakai ulang semua jalur.
  const unbilledWhere = {
    status: { in: [...UNBILLED_MEMO_STATUSES] },
    deletedAt: null,
    ...dateWhere,
  }
  const toUnbilled = (
    inv: BridgeInvoice,
    customerVehicleId: number | null,
    vehiclePlate: string | null,
    customerName: string,
  ): VehicleMarginUnbilledInput => ({
    id: inv.id,
    customerVehicleId,
    vehiclePlate,
    customerName,
    status: inv.status,
    amount: safeSubtract(Number(inv.subtotal), Number(inv.discount), 2),
  })
  const unbilled: VehicleMarginUnbilledInput[] = []
  // Entri (b) ditahan terpisah supaya urutan dedup (a)->(b)->(c) terjaga
  // walau query (a-memo) berjalan sesudah rantai existing.
  const jobUnbilled: VehicleMarginUnbilledInput[] = []

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

    // (b-memo) Memo WO non-proyek: invoice memo dari himpunan jembatan yang
    // sama, diatribusikan persis seperti billed (projectId -> bukan WO;
    // bersama -> WO pertama). Dedup global final di builder.
    const workOrderMeta = new Map(workOrders.map((w) => [w.id, w]))
    const memoInvoices: BridgeInvoice[] = [...quotationInvoices, ...salesOrderInvoices]
      .filter(
        (inv) =>
          inv.deletedAt === null &&
          (UNBILLED_MEMO_STATUSES as readonly string[]).includes(inv.status),
      )
      .sort((a, b) => a.id - b.id)
    for (const inv of memoInvoices) {
      if (inv.projectId !== null) continue
      const woId =
        (inv.quotationId !== null ? workOrderByQuotation.get(inv.quotationId) : undefined) ??
        (inv.salesOrderId !== null ? workOrderBySalesOrder.get(inv.salesOrderId) : undefined)
      if (woId === undefined) continue
      const w = workOrderMeta.get(woId)
      if (!w) continue
      unbilled.push(
        toUnbilled(inv, w.customerVehicleId, w.customerVehicle?.plateNumber ?? null, w.customer.name),
      )
    }
    jobUnbilled.push(...unbilled.splice(0, unbilled.length))

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

  unbilled.push(...jobUnbilled)

  // (c-memo) Invoice langsung memo: saringan sama persis kelas (c), status memo.
  const directMemoRows = await prisma.salesInvoice.findMany({
    where: {
      customerVehicleId: { not: null },
      quotationId: null,
      salesOrderId: null,
      projectId: null,
      ...unbilledWhere,
    },
    select: {
      id: true,
      customerVehicleId: true,
      status: true,
      subtotal: true,
      discount: true,
      customer: { select: { name: true } },
    },
  })
  const directMemoVehicleIds = [
    ...new Set(
      directMemoRows
        .map((inv) => inv.customerVehicleId)
        .filter((id): id is number => id !== null),
    ),
  ]
  const missingMemoVehicleIds = directMemoVehicleIds.filter((id) => !plateByVehicleId.has(id))
  if (missingMemoVehicleIds.length) {
    const memoVehicles = await prisma.customerVehicle.findMany({
      where: { id: { in: missingMemoVehicleIds } },
      select: { id: true, plateNumber: true },
    })
    for (const v of memoVehicles) plateByVehicleId.set(v.id, v.plateNumber)
  }
  for (const inv of directMemoRows) {
    unbilled.push({
      id: inv.id,
      customerVehicleId: inv.customerVehicleId,
      vehiclePlate:
        inv.customerVehicleId !== null
          ? (plateByVehicleId.get(inv.customerVehicleId) ?? null)
          : null,
      customerName: inv.customer.name,
      status: inv.status,
      amount: safeSubtract(Number(inv.subtotal), Number(inv.discount), 2),
    })
  }

  // (a-memo) Memo proyek: invoice memo ber-projectId langsung + quotation
  // WO proyek (semua WO ber-projectId non-null pada periode). Terpisah dari
  // loadProjectPlReport — proyek yang hanya punya memo (tanpa billed/cost)
  // tetap menghasilkan ember memo di builder.
  const projectUnbilled: VehicleMarginUnbilledInput[] = []
  const projectWorkOrders = await prisma.workOrder.findMany({
    where: { projectId: { not: null }, ...dateWhere },
    select: { projectId: true, quotationId: true },
  })
  const projectMemoIds = new Set<number>([
    ...projectPl.rows.map((r) => r.projectId),
    ...projectWorkOrders
      .map((w) => w.projectId)
      .filter((id): id is number => id !== null),
  ])
  if (projectMemoIds.size > 0) {
    const projectIds = [...projectMemoIds]
    const quotationIds = [
      ...new Set(
        projectWorkOrders
          .map((w) => w.quotationId)
          .filter((id): id is number => id !== null),
      ),
    ]
    const [memoProjects, directMemoInvoices, bridgeMemoInvoices] = await Promise.all([
      prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: {
          id: true,
          customerVehicleId: true,
          customer: { select: { name: true } },
          customerVehicle: { select: { plateNumber: true } },
        },
      }),
      prisma.salesInvoice.findMany({
        where: { projectId: { in: projectIds }, ...unbilledWhere },
        select: INVOICE_BRIDGE_SELECT,
      }),
      quotationIds.length
        ? prisma.salesInvoice.findMany({
            where: { quotationId: { in: quotationIds }, ...unbilledWhere },
            select: INVOICE_BRIDGE_SELECT,
          })
        : Promise.resolve([] as BridgeInvoice[]),
    ])
    const projectMeta = new Map(
      memoProjects.map((p) => [
        p.id,
        {
          customerVehicleId: p.customerVehicleId,
          vehiclePlate: p.customerVehicle?.plateNumber ?? null,
          customerName: p.customer.name,
        },
      ]),
    )
    const projectByQuotation = new Map<number, number>()
    for (const w of projectWorkOrders) {
      if (w.projectId !== null && w.quotationId !== null && !projectByQuotation.has(w.quotationId)) {
        projectByQuotation.set(w.quotationId, w.projectId)
      }
    }
    const pushProjectMemo = (inv: BridgeInvoice) => {
      // Invoice ber-projectId -> ember proyek itu; jembatan quotation hanya
      // untuk invoice tanpa projectId (persis saringan builder F-029).
      const projectId =
        inv.projectId ?? (inv.quotationId !== null ? projectByQuotation.get(inv.quotationId) : undefined)
      if (projectId === undefined) return
      const meta = projectMeta.get(projectId)
      if (!meta) return
      projectUnbilled.push(toUnbilled(inv, meta.customerVehicleId, meta.vehiclePlate, meta.customerName))
    }
    for (const inv of directMemoInvoices) pushProjectMemo(inv)
    for (const inv of bridgeMemoInvoices) {
      if (inv.projectId !== null && !projectMemoIds.has(inv.projectId)) continue
      pushProjectMemo(inv)
    }
  }

  // Urutan dedup builder: (a) proyek, lalu (b) WO, lalu (c) langsung.
  const orderedUnbilled = [...projectUnbilled, ...unbilled]

  return {
    ...buildVehicleMargin({ projects, jobs, directInvoices, unbilled: orderedUnbilled }),
    ...labels,
  }
}

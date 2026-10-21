/**
 * Loader read-model laba/rugi proyek (F-2026-10-21-029).
 *
 * Satu sumber kebenaran untuk halaman laporan L/R proyek DAN detail
 * proyek (frontend, task terpisah): keduanya wajib memanggil loader ini
 * dan tidak boleh menghitung uang sendiri. Loader membatasi query pada
 * periode dokumen, mengambil massal per sumber (tanpa N+1), lalu
 * mendelegasikan SEMUA aturan agregasi ke builder murni `buildProjectPl`
 * — supaya angka bisa diuji tanpa DB dan falsifikasi cukup mencabut satu
 * sumber di builder.
 *
 * Jembatan yang dimuat (aturan kepemilikan penuh di header `project-pl.ts`):
 *  - WorkOrder pada himpunan proyek aktif menjadi jembatan: quotation-nya
 *    menarik invoice tanpa projectId, MI ber-workOrderId, dan
 *    ProductionCost ber-workOrderId. WO di luar periode tetap jembatan sah
 *    untuk dokumen DALAM periode, jadi WO dimuat per proyek aktif tanpa
 *    saringan tanggal.
 *  - Invoice: `projectId` langsung (periode) ATAU `quotationId` pada
 *    himpunan quotation WO jembatan di atas.
 *  - Timesheet: seluruh proyek aktif (`projectId` wajib di schema).
 *
 * Proyek "aktif" pada periode = proyek yang muncul di setidaknya satu
 * sumber dokumen periode ini (direct invoice / MI / expense / petty /
 * vendor bill / timesheet / WO ber-tanggal periode) — pola page existing
 * (`activeProjectIds` dari himpunan kunci map per sumber).
 *
 * Status difilter di query mengikuti page existing persis supaya loader
 * tidak memuat baris yang pasti dibuang builder:
 * invoice posted/partial/paid; MI completed; Expense approved;
 * PettyCash OUT; VendorBill confirmed/posted/partial/paid (komentar page:
 * "draft belum beban"). ProductionCost & Timesheet tidak punya status —
 * semua baris pada WO/proyek aktif dimuat, builder menyaring kepemilikannya.
 */

import { prisma } from "@/lib/db/prisma"
import {
  PROJECT_PL_INVOICE_STATUSES,
  PROJECT_PL_VENDOR_BILL_STATUSES,
  buildProjectPl,
  type ProjectPlResult,
} from "@/lib/reports/project-pl"
import { rangePeriodLabels } from "@/lib/reports/period-label"

export type { ProjectPlResult } from "@/lib/reports/project-pl"
export { buildProjectPl } from "@/lib/reports/project-pl"

export interface ProjectPlRow extends ProjectPlResult {
  projectDocumentNo: string | null
  projectName: string
  customerName: string
  vehiclePlate: string | null
  projectStatus: string
}

export interface ProjectPlReport {
  rows: ProjectPlRow[]
  periodLabel: string
  periodCaption: string
}

const WORK_ORDER_SELECT = {
  id: true,
  projectId: true,
  quotationId: true,
  status: true,
} as const

const INVOICE_SELECT = {
  id: true,
  projectId: true,
  quotationId: true,
  status: true,
  subtotal: true,
  discount: true,
  deletedAt: true,
} as const

const MATERIAL_ISSUE_SELECT = {
  id: true,
  projectId: true,
  workOrderId: true,
  status: true,
  items: { select: { qty: true, cost: true } },
} as const

const PRODUCTION_COST_SELECT = {
  workOrderId: true,
  amount: true,
  sourceTimesheetId: true,
  purchaseOrderId: true,
} as const

const VENDOR_BILL_SELECT = {
  id: true,
  projectId: true,
  purchaseOrderId: true,
  status: true,
  grandTotal: true,
  deletedAt: true,
} as const

function toBuilderInput(all: {
  projectId: number
  invoices: {
    id: number
    projectId: number | null
    quotationId: number | null
    status: string
    subtotal: unknown
    discount: unknown
    deletedAt: Date | null
  }[]
  workOrders: { id: number; projectId: number | null; quotationId: number | null; status: string }[]
  materialIssues: {
    id: number
    projectId: number | null
    workOrderId: number | null
    status: string
    items: { qty: unknown; cost: unknown }[]
  }[]
  productionCosts: {
    workOrderId: number | null
    amount: unknown
    sourceTimesheetId: number | null
    purchaseOrderId: number | null
  }[]
  expenses: { projectId: number | null; status: string; amount: unknown }[]
  pettyCash: { projectId: number | null; type: string; amount: unknown }[]
  vendorBills: {
    id: number
    projectId: number | null
    purchaseOrderId: number | null
    status: string
    grandTotal: unknown
    deletedAt: Date | null
  }[]
  timesheets: { id: number; projectId: number; hours: unknown }[]
}) {
  return {
    projectId: all.projectId,
    invoices: all.invoices.map((inv) => ({
      id: inv.id,
      projectId: inv.projectId,
      quotationId: inv.quotationId,
      status: String(inv.status),
      subtotal: Number(inv.subtotal),
      discount: Number(inv.discount),
      deletedAt: inv.deletedAt,
    })),
    workOrders: all.workOrders,
    materialIssues: all.materialIssues.map((mi) => ({
      id: mi.id,
      projectId: mi.projectId,
      workOrderId: mi.workOrderId,
      status: mi.status,
      items: mi.items.map((item) => ({ qty: Number(item.qty), cost: Number(item.cost) })),
    })),
    productionCosts: all.productionCosts.map((c) => ({
      workOrderId: c.workOrderId,
      amount: Number(c.amount),
      sourceTimesheetId: c.sourceTimesheetId,
      purchaseOrderId: c.purchaseOrderId,
    })),
    expenses: all.expenses.map((e) => ({
      projectId: e.projectId,
      status: e.status,
      amount: Number(e.amount),
    })),
    pettyCash: all.pettyCash.map((p) => ({
      projectId: p.projectId,
      type: p.type,
      amount: Number(p.amount),
    })),
    vendorBills: all.vendorBills.map((b) => ({
      id: b.id,
      projectId: b.projectId,
      purchaseOrderId: b.purchaseOrderId,
      status: b.status,
      grandTotal: Number(b.grandTotal),
      deletedAt: b.deletedAt,
    })),
    timesheets: all.timesheets.map((t) => ({
      id: t.id,
      projectId: t.projectId,
      hours: Number(t.hours),
    })),
  }
}

export async function loadProjectPlReport(period: {
  start: Date
  end: Date
}): Promise<ProjectPlReport> {
  const labels = rangePeriodLabels(period)
  const dateWhere = { date: { gte: period.start, lte: period.end } }

  // Tahap 1 — sumber langsung ber-periode. Himpunan proyek yang muncul di
  // tahap ini (ditambah WO ber-tanggal periode) = proyek aktif.
  const [
    directInvoices,
    directMaterialIssues,
    expenses,
    pettyCash,
    vendorBills,
    timesheets,
    periodWorkOrders,
  ] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: {
        projectId: { not: null },
        status: { in: [...PROJECT_PL_INVOICE_STATUSES] },
        deletedAt: null,
        ...dateWhere,
      },
      select: INVOICE_SELECT,
    }),
    prisma.materialIssue.findMany({
      where: { projectId: { not: null }, status: "completed", ...dateWhere },
      select: MATERIAL_ISSUE_SELECT,
    }),
    prisma.expense.findMany({
      where: { projectId: { not: null }, status: "approved", ...dateWhere },
      select: { projectId: true, status: true, amount: true },
    }),
    prisma.pettyCash.findMany({
      where: { projectId: { not: null }, type: "OUT", ...dateWhere },
      select: { projectId: true, type: true, amount: true },
    }),
    prisma.vendorBill.findMany({
      where: {
        projectId: { not: null },
        status: { in: [...PROJECT_PL_VENDOR_BILL_STATUSES] },
        deletedAt: null,
        ...dateWhere,
      },
      select: VENDOR_BILL_SELECT,
    }),
    prisma.timesheet.findMany({
      where: { ...dateWhere },
      select: { id: true, projectId: true, hours: true },
    }),
    prisma.workOrder.findMany({
      where: { projectId: { not: null }, ...dateWhere },
      select: WORK_ORDER_SELECT,
      orderBy: { id: "asc" },
    }),
  ])

  const activeProjectIds = new Set<number>()
  for (const inv of directInvoices) if (inv.projectId !== null) activeProjectIds.add(inv.projectId)
  for (const mi of directMaterialIssues) if (mi.projectId !== null) activeProjectIds.add(mi.projectId)
  for (const e of expenses) if (e.projectId !== null) activeProjectIds.add(e.projectId)
  for (const p of pettyCash) if (p.projectId !== null) activeProjectIds.add(p.projectId)
  for (const b of vendorBills) if (b.projectId !== null) activeProjectIds.add(b.projectId)
  for (const t of timesheets) activeProjectIds.add(t.projectId)
  for (const w of periodWorkOrders) if (w.projectId !== null) activeProjectIds.add(w.projectId)

  if (activeProjectIds.size === 0) {
    return { rows: [], ...labels }
  }

  // Tahap 2 — jembatan WO untuk proyek aktif (semua WO proyek itu, tanpa
  // saringan tanggal), lalu sumber yang hanya terjangkau lewat WO.
  const workOrders = await prisma.workOrder.findMany({
    where: { projectId: { in: [...activeProjectIds] } },
    select: WORK_ORDER_SELECT,
    orderBy: { id: "asc" },
  })
  const workOrderIds = workOrders.map((w) => w.id)
  const bridgeQuotationIds = [
    ...new Set(
      workOrders
        .map((w) => w.quotationId)
        .filter((id): id is number => id !== null),
    ),
  ]

  const [bridgeInvoices, bridgedMaterialIssues, productionCosts, projects] =
    await Promise.all([
      bridgeQuotationIds.length
        ? prisma.salesInvoice.findMany({
            where: {
              quotationId: { in: bridgeQuotationIds },
              status: { in: [...PROJECT_PL_INVOICE_STATUSES] },
              deletedAt: null,
              ...dateWhere,
            },
            select: INVOICE_SELECT,
          })
        : Promise.resolve([]),
      workOrderIds.length
        ? prisma.materialIssue.findMany({
            where: { status: "completed", workOrderId: { in: workOrderIds }, ...dateWhere },
            select: MATERIAL_ISSUE_SELECT,
          })
        : Promise.resolve([]),
      workOrderIds.length
        ? prisma.productionCost.findMany({
            where: { workOrderId: { in: workOrderIds } },
            select: PRODUCTION_COST_SELECT,
          })
        : Promise.resolve([]),
      prisma.project.findMany({
        where: { id: { in: [...activeProjectIds] } },
        select: {
          id: true,
          documentNo: true,
          name: true,
          status: true,
          customer: { select: { name: true } },
          customerVehicle: { select: { plateNumber: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
    ])

  const allInvoices = [...directInvoices, ...bridgeInvoices]
  const allMaterialIssues = [...directMaterialIssues, ...bridgedMaterialIssues]

  const rows: ProjectPlRow[] = projects.map((project) => {
    const pl = buildProjectPl(
      toBuilderInput({
        projectId: project.id,
        invoices: allInvoices,
        workOrders,
        materialIssues: allMaterialIssues,
        productionCosts,
        expenses,
        pettyCash,
        vendorBills,
        timesheets,
      }),
    )
    return {
      ...pl,
      projectDocumentNo: project.documentNo,
      projectName: project.name,
      customerName: project.customer.name,
      vehiclePlate: project.customerVehicle?.plateNumber ?? null,
      projectStatus: project.status,
    }
  })

  return { rows, ...labels }
}

/**
 * L/R satu proyek tanpa saringan periode (untuk detail proyek).
 * Kontrak frontend F-029: detail proyek memakai builder yang sama —
 * BUKAN quotation per-customerId. Tanpa periode = seluruh dokumen proyek.
 */
export async function loadProjectPlForProject(
  projectId: number,
): Promise<ProjectPlResult | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId },
    select: { id: true },
  })
  if (!project) return null

  const workOrders = await prisma.workOrder.findMany({
    where: { projectId },
    select: WORK_ORDER_SELECT,
    orderBy: { id: "asc" },
  })
  const workOrderIds = workOrders.map((w) => w.id)
  const quotationIds = [
    ...new Set(
      workOrders
        .map((w) => w.quotationId)
        .filter((id): id is number => id !== null),
    ),
  ]

  const [directInvoices, bridgeInvoices, materialIssues, productionCosts, expenses, pettyCash, vendorBills, timesheets] =
    await Promise.all([
      prisma.salesInvoice.findMany({
        where: { projectId, deletedAt: null },
        select: INVOICE_SELECT,
      }),
      quotationIds.length
        ? prisma.salesInvoice.findMany({
            where: { quotationId: { in: quotationIds }, deletedAt: null },
            select: INVOICE_SELECT,
          })
        : Promise.resolve([]),
      prisma.materialIssue.findMany({
        where: {
          OR: [
            { projectId },
            ...(workOrderIds.length ? [{ workOrderId: { in: workOrderIds } }] : []),
          ],
        },
        select: MATERIAL_ISSUE_SELECT,
      }),
      workOrderIds.length
        ? prisma.productionCost.findMany({
            where: { workOrderId: { in: workOrderIds } },
            select: PRODUCTION_COST_SELECT,
          })
        : Promise.resolve([]),
      prisma.expense.findMany({
        where: { projectId },
        select: { projectId: true, status: true, amount: true },
      }),
      prisma.pettyCash.findMany({
        where: { projectId },
        select: { projectId: true, type: true, amount: true },
      }),
      prisma.vendorBill.findMany({
        where: { projectId, deletedAt: null },
        select: VENDOR_BILL_SELECT,
      }),
      prisma.timesheet.findMany({
        where: { projectId },
        select: { id: true, projectId: true, hours: true },
      }),
    ])

  return buildProjectPl(
    toBuilderInput({
      projectId,
      invoices: [...directInvoices, ...bridgeInvoices],
      workOrders,
      materialIssues,
      productionCosts,
      expenses,
      pettyCash,
      vendorBills,
      timesheets,
    }),
  )
}

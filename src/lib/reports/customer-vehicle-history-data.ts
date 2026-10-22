/**
 * Loader read-only linimasa kendaraan (F-2026-10-20-15).
 *
 * Satu kendaraan (`customerVehicleId`) dirangkai dari lima sumber existing:
 * quotation, sales order, sales invoice, work order, project. Invoice tidak
 * punya FK kendaraan langsung yang selalu terisi, jadi dikumpulkan dari
 * TIGA jembatan lalu di-dedup per id:
 *   1. `customerVehicleId` langsung,
 *   2. `quotationId` lewat quotation kendaraan ini,
 *   3. `salesOrderId` lewat sales order kendaraan ini,
 *   4. `projectId` lewat project kendaraan ini ATAU work order kendaraan ini.
 * Tanpa dedup, invoice yang tertaut quotation+SO sekaligus tampil dua kali
 * di linimasa.
 *
 * Seksi part terpasang (F-2026-10-22-072-S §2/AC-IP-9): riwayat ikut
 * memuat registri InstalledPart kendaraan ini lewat `getInstalledParts`
 * — sumbernya tabel registri per kendaraan, BUKAN dokumen issue mentah,
 * jadi part dari issue bebas (tanpa kendaraan teratribusi) mustahil
 * tampil di kendaraan mana pun.
 *
 * Read-only: tanpa migrasi, tanpa jurnal, tanpa mutasi. Urutan linimasa
 * ditentukan builder murni (tanggal desc, tie-break deterministik) supaya
 * frontend tidak mengurutkan ulang dengan aturan berbeda.
 */

import { prisma } from "@/lib/db/prisma"
import { getInstalledParts } from "./installed-parts-data"
import type { InstalledPartsRegistry } from "./installed-parts"

export type CustomerVehicleHistoryKind =
  | "quotation"
  | "sales_order"
  | "sales_invoice"
  | "work_order"
  | "project"

export interface CustomerVehicleHistoryEntry {
  kind: CustomerVehicleHistoryKind
  id: number
  slug: string | null
  /** Nomor dokumen; project memakai `name` bila documentNo kosong. */
  documentNo: string
  /** Project tidak punya kolom `date`; pakai startDate ?? createdAt. */
  date: Date
  createdAt: Date
  status: string
  /** Hanya invoice: total tagihan. Lainnya null. */
  grandTotal: number | null
  /** Hanya invoice: sudah terbayar. Lainnya null. */
  paidAmount: number | null
}

export interface CustomerVehicleHistory {
  customerVehicleId: number
  entries: CustomerVehicleHistoryEntry[]
  counts: Record<CustomerVehicleHistoryKind, number>
  /** Seksi part terpasang dari registri InstalledPart (F-072-S §2). */
  installedParts: InstalledPartsRegistry
}

const KIND_ORDER: Record<CustomerVehicleHistoryKind, number> = {
  quotation: 0,
  sales_order: 1,
  sales_invoice: 2,
  work_order: 3,
  project: 4,
}

/** Urut tanggal desc; seri dipecah kind lalu id desc — deterministik. */
export function sortVehicleHistory(
  entries: CustomerVehicleHistoryEntry[],
): CustomerVehicleHistoryEntry[] {
  return [...entries].sort((a, b) => {
    const byDate = b.date.getTime() - a.date.getTime()
    if (byDate !== 0) return byDate
    const byCreated = b.createdAt.getTime() - a.createdAt.getTime()
    if (byCreated !== 0) return byCreated
    const byKind = KIND_ORDER[a.kind] - KIND_ORDER[b.kind]
    if (byKind !== 0) return byKind
    return b.id - a.id
  })
}

export function countVehicleHistory(
  entries: CustomerVehicleHistoryEntry[],
): Record<CustomerVehicleHistoryKind, number> {
  const counts: Record<CustomerVehicleHistoryKind, number> = {
    quotation: 0,
    sales_order: 0,
    sales_invoice: 0,
    work_order: 0,
    project: 0,
  }
  for (const e of entries) counts[e.kind] += 1
  return counts
}

const INVOICE_SELECT = {
  id: true,
  slug: true,
  documentNo: true,
  date: true,
  createdAt: true,
  status: true,
  grandTotal: true,
  paidAmount: true,
} as const

type InvoiceRow = {
  id: number
  slug: string | null
  documentNo: string
  date: Date
  createdAt: Date
  status: unknown
  grandTotal: unknown
  paidAmount: unknown
}

function toInvoiceEntry(inv: InvoiceRow): CustomerVehicleHistoryEntry {
  return {
    kind: "sales_invoice",
    id: inv.id,
    slug: inv.slug,
    documentNo: inv.documentNo,
    date: inv.date,
    createdAt: inv.createdAt,
    status: String(inv.status),
    grandTotal: Number(inv.grandTotal),
    paidAmount: Number(inv.paidAmount),
  }
}

export async function getCustomerVehicleHistory(
  customerVehicleId: number,
  limitPerKind = 20,
): Promise<CustomerVehicleHistory> {
  const take = Math.max(1, Math.min(100, Math.trunc(limitPerKind) || 20))

  const installedPartsPromise = getInstalledParts(customerVehicleId)
  const [quotations, salesOrders, workOrders, directProjects, directInvoices] =
    await Promise.all([
      prisma.quotation.findMany({
        where: { customerVehicleId, deletedAt: null },
        select: {
          id: true, slug: true, documentNo: true, date: true,
          createdAt: true, status: true,
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take,
      }),
      prisma.salesOrder.findMany({
        where: { customerVehicleId, deletedAt: null },
        select: {
          id: true, slug: true, documentNo: true, date: true,
          createdAt: true, status: true,
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take,
      }),
      prisma.workOrder.findMany({
        where: { customerVehicleId },
        select: {
          id: true, slug: true, documentNo: true, date: true,
          createdAt: true, status: true, projectId: true,
        },
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take,
      }),
      prisma.project.findMany({
        where: { customerVehicleId },
        select: {
          id: true, slug: true, documentNo: true, name: true,
          startDate: true, createdAt: true, status: true,
        },
        orderBy: { createdAt: "desc" },
        take,
      }),
      prisma.salesInvoice.findMany({
        where: { customerVehicleId, deletedAt: null },
        select: INVOICE_SELECT,
        orderBy: [{ date: "desc" }, { id: "desc" }],
        take,
      }),
    ])

  const quotationIds = quotations.map((q) => q.id)
  const salesOrderIds = salesOrders.map((s) => s.id)
  const projectIds = [
    ...new Set([
      ...directProjects.map((p) => p.id),
      ...workOrders
        .map((w) => w.projectId)
        .filter((p): p is number => p !== null),
    ]),
  ]

  const empty: InvoiceRow[] = []
  const [viaQuotation, viaSalesOrder, viaProject] = await Promise.all([
    quotationIds.length === 0
      ? Promise.resolve(empty)
      : prisma.salesInvoice.findMany({
          where: { quotationId: { in: quotationIds }, deletedAt: null },
          select: INVOICE_SELECT,
          orderBy: [{ date: "desc" }, { id: "desc" }],
          take,
        }),
    salesOrderIds.length === 0
      ? Promise.resolve(empty)
      : prisma.salesInvoice.findMany({
          where: { salesOrderId: { in: salesOrderIds }, deletedAt: null },
          select: INVOICE_SELECT,
          orderBy: [{ date: "desc" }, { id: "desc" }],
          take,
        }),
    projectIds.length === 0
      ? Promise.resolve(empty)
      : prisma.salesInvoice.findMany({
          where: { projectId: { in: projectIds }, deletedAt: null },
          select: INVOICE_SELECT,
          orderBy: [{ date: "desc" }, { id: "desc" }],
          take,
        }),
  ])

  const invoiceById = new Map<number, InvoiceRow>()
  for (const inv of [...directInvoices, ...viaQuotation, ...viaSalesOrder, ...viaProject]) {
    invoiceById.set(inv.id, inv as InvoiceRow)
  }
  // Batas per-jenis berlaku sesudah dedup, bukan per jembatan.
  const invoices = [...invoiceById.values()]
    .sort((a, b) => b.date.getTime() - a.date.getTime() || b.id - a.id)
    .slice(0, take)

  const entries = sortVehicleHistory([
    ...quotations.map((q) => ({
      kind: "quotation" as const, id: q.id, slug: q.slug,
      documentNo: q.documentNo, date: q.date, createdAt: q.createdAt,
      status: q.status, grandTotal: null, paidAmount: null,
    })),
    ...salesOrders.map((s) => ({
      kind: "sales_order" as const, id: s.id, slug: s.slug,
      documentNo: s.documentNo, date: s.date, createdAt: s.createdAt,
      status: s.status, grandTotal: null, paidAmount: null,
    })),
    ...invoices.map(toInvoiceEntry),
    ...workOrders.map((w) => ({
      kind: "work_order" as const, id: w.id, slug: w.slug,
      documentNo: w.documentNo, date: w.date, createdAt: w.createdAt,
      status: w.status, grandTotal: null, paidAmount: null,
    })),
    ...directProjects.map((p) => ({
      kind: "project" as const, id: p.id, slug: p.slug,
      documentNo: p.documentNo ?? p.name, date: p.startDate ?? p.createdAt,
      createdAt: p.createdAt, status: p.status,
      grandTotal: null, paidAmount: null,
    })),
  ])

  return {
    customerVehicleId,
    entries,
    counts: countVehicleHistory(entries),
    installedParts: await installedPartsPromise,
  }
}

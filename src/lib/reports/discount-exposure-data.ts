/**
 * Loader read-only paparan diskon efektif dokumen penjualan
 * (F-2026-10-25-006-S tahap 1, PUTUSAN LEAD §8A Q-DX-1..4).
 *
 * Izin `view_reports` ditegakkan DI SINI fail-closed (Q-DX-2, pola
 * collection-queue-data.ts); tanpa key baru. Baca-saja murni (BR-DX-03):
 * nol tulis dokumen/status/jurnal/notifikasi.
 *
 * Populasi Q-DX-3 persis: Quotation sent/accepted/approved/converted;
 * SalesOrder DELIVERABLE_ORDER_STATUSES existing (jangan kosakata kedua);
 * SalesInvoice posted/partial/paid/approved/sent; semua deletedAt null.
 * Periode inklusif [start, end] atas tanggal dokumen (page memarse
 * slug lewat parseReportPeriod pola laporan repo).
 *
 * Ambang: satu query ApprovalWorkflow aktif untuk ketiga modelType,
 * dipilih prioritas tertinggi per modelType (pola
 * quotation-approval-gate-data.ts), conditions diparse builder-side
 * lewat parseApprovalThresholds existing. Tanpa konfigurasi sah =
 * TANPA_AMBANG (BR-DX-04).
 *
 * Anti-N+1: 3 query dokumen (baris ikut select) + 1 query workflow.
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { DELIVERABLE_ORDER_STATUSES } from "@/lib/validations/sales.schemas"
import { parseApprovalThresholds } from "@/lib/reports/quotation-approval-gate"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import {
  buildDiscountExposure,
  DISCOUNT_EXPOSURE_MODEL_TYPES,
  type DiscountExposure,
  type DiscountExposureDocInput,
  type DiscountExposureDocType,
  type DiscountExposureThresholdsByType,
} from "@/lib/reports/discount-exposure"

export const DISCOUNT_EXPOSURE_QUOTATION_STATUSES = [
  "sent",
  "accepted",
  "approved",
  "converted",
] as const

export const DISCOUNT_EXPOSURE_INVOICE_STATUSES = [
  "posted",
  "partial",
  "paid",
  "approved",
  "sent",
] as const

type DocSelectRow = {
  id: number
  slug: string | null
  documentNo: string
  date: Date
  status: string
  customerId: number
  salesEmployeeId: number | null
  subtotal: unknown
  discount: unknown
  grandTotal: unknown
  customer: { name: string }
  salesEmployee: { name: string } | null
  items: { qty: unknown; unitPrice: unknown; discount: unknown }[]
}

function toDocInput(
  docType: DiscountExposureDocType,
  row: DocSelectRow,
): DiscountExposureDocInput {
  return {
    docType,
    docId: row.id,
    slug: row.slug,
    documentNo: row.documentNo,
    date: row.date,
    status: row.status,
    customerId: row.customerId,
    customerName: row.customer.name,
    salesEmployeeId: row.salesEmployeeId,
    salesEmployeeName: row.salesEmployee?.name ?? null,
    subtotal: Number(row.subtotal),
    headerDiscount: Number(row.discount),
    grandTotal: Number(row.grandTotal),
    lines: row.items.map((i) => ({
      qty: Number(i.qty),
      unitPrice: Number(i.unitPrice),
      discount: Number(i.discount),
    })),
  }
}

const DOC_SELECT = {
  id: true,
  slug: true,
  documentNo: true,
  date: true,
  status: true,
  customerId: true,
  salesEmployeeId: true,
  subtotal: true,
  discount: true,
  grandTotal: true,
  customer: { select: { name: true } },
  salesEmployee: { select: { name: true } },
} as const

const LINE_SELECT = { qty: true, unitPrice: true, discount: true } as const

export interface DiscountExposureFilters {
  /** Awal periode inklusif (tanggal dokumen >= start). */
  start: Date
  /** Akhir periode inklusif (tanggal dokumen <= end). */
  end: Date
  docTypes?: DiscountExposureDocType[]
  salesEmployeeId?: number | null
  customerId?: number
}

export async function getDiscountExposure(
  filters: DiscountExposureFilters,
): Promise<DiscountExposure> {
  await requirePermission("view_reports")

  const wanted = new Set<DiscountExposureDocType>(
    filters.docTypes ?? ["QUOTATION", "SALES_ORDER", "SALES_INVOICE"],
  )
  const dateWhere = { gte: filters.start, lte: filters.end }
  const sellerWhere =
    filters.salesEmployeeId === undefined ? {} : { salesEmployeeId: filters.salesEmployeeId }
  const customerWhere = filters.customerId === undefined ? {} : { customerId: filters.customerId }

  const [quotations, salesOrders, salesInvoices, workflows] = await Promise.all([
    wanted.has("QUOTATION")
      ? prisma.quotation.findMany({
          where: {
            status: { in: [...DISCOUNT_EXPOSURE_QUOTATION_STATUSES] },
            deletedAt: null,
            date: dateWhere,
            ...sellerWhere,
            ...customerWhere,
          },
          select: {
            ...DOC_SELECT,
            sections: { select: { items: { select: LINE_SELECT } } },
          },
          orderBy: [{ date: "asc" }, { id: "asc" }],
        })
      : Promise.resolve([]),
    wanted.has("SALES_ORDER")
      ? prisma.salesOrder.findMany({
          where: {
            status: { in: [...DELIVERABLE_ORDER_STATUSES] },
            deletedAt: null,
            date: dateWhere,
            ...sellerWhere,
            ...customerWhere,
          },
          select: { ...DOC_SELECT, items: { select: LINE_SELECT } },
          orderBy: [{ date: "asc" }, { id: "asc" }],
        })
      : Promise.resolve([]),
    wanted.has("SALES_INVOICE")
      ? prisma.salesInvoice.findMany({
          where: {
            status: { in: [...DISCOUNT_EXPOSURE_INVOICE_STATUSES] },
            deletedAt: null,
            date: dateWhere,
            ...sellerWhere,
            ...customerWhere,
          },
          select: { ...DOC_SELECT, items: { select: LINE_SELECT } },
          orderBy: [{ date: "asc" }, { id: "asc" }],
        })
      : Promise.resolve([]),
    prisma.approvalWorkflow.findMany({
      where: {
        modelType: { in: Object.values(DISCOUNT_EXPOSURE_MODEL_TYPES) },
        isActive: true,
        deletedAt: null,
      },
      orderBy: [{ priority: "desc" }, { id: "asc" }],
      select: {
        modelType: true,
        steps: {
          orderBy: { stepOrder: "asc" },
          select: { conditions: true },
        },
      },
    }),
  ])

  // Workflow prioritas tertinggi per modelType (query sudah terurut).
  const thresholdsByType: DiscountExposureThresholdsByType = {}
  const seenModelTypes = new Set<string>()
  for (const workflow of workflows) {
    if (seenModelTypes.has(workflow.modelType)) continue
    seenModelTypes.add(workflow.modelType)
    const docType = (
      Object.entries(DISCOUNT_EXPOSURE_MODEL_TYPES) as [DiscountExposureDocType, string][]
    ).find(([, modelType]) => modelType === workflow.modelType)?.[0]
    if (!docType) continue
    thresholdsByType[docType] = workflow.steps.map((s) => parseApprovalThresholds(s.conditions))
  }

  const inputs: DiscountExposureDocInput[] = [
    ...quotations.map((q) =>
      toDocInput("QUOTATION", {
        ...q,
        status: q.status,
        items: q.sections.flatMap((s) => s.items),
      }),
    ),
    ...salesOrders.map((so) => toDocInput("SALES_ORDER", so)),
    ...salesInvoices.map((inv) =>
      toDocInput("SALES_INVOICE", { ...inv, documentNo: salesInvoiceLabel(inv), status: String(inv.status) }),
    ),
  ]

  return buildDiscountExposure(inputs, thresholdsByType)
}

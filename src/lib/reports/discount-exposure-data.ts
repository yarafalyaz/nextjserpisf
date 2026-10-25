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
            sections: {
              select: {
                items: { select: { qty: true, unitPrice: true, discount: true } },
              },
            },
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
          select: {
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
            items: { select: { qty: true, unitPrice: true, discount: true } },
          },
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
          select: {
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
            items: { select: { qty: true, unitPrice: true, discount: true } },
          },
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
    ...quotations.map((q) => ({
      docType: "QUOTATION" as const,
      docId: q.id,
      slug: q.slug,
      documentNo: q.documentNo,
      date: q.date,
      status: q.status,
      customerId: q.customerId,
      customerName: q.customer.name,
      salesEmployeeId: q.salesEmployeeId,
      salesEmployeeName: q.salesEmployee?.name ?? null,
      subtotal: Number(q.subtotal),
      headerDiscount: Number(q.discount),
      grandTotal: Number(q.grandTotal),
      lines: q.sections.flatMap((s) =>
        s.items.map((i) => ({
          qty: Number(i.qty),
          unitPrice: Number(i.unitPrice),
          discount: Number(i.discount),
        })),
      ),
    })),
    ...salesOrders.map((so) => ({
      docType: "SALES_ORDER" as const,
      docId: so.id,
      slug: so.slug,
      documentNo: so.documentNo,
      date: so.date,
      status: so.status,
      customerId: so.customerId,
      customerName: so.customer.name,
      salesEmployeeId: so.salesEmployeeId,
      salesEmployeeName: so.salesEmployee?.name ?? null,
      subtotal: Number(so.subtotal),
      headerDiscount: Number(so.discount),
      grandTotal: Number(so.grandTotal),
      lines: so.items.map((i) => ({
        qty: Number(i.qty),
        unitPrice: Number(i.unitPrice),
        discount: Number(i.discount),
      })),
    })),
    ...salesInvoices.map((inv) => ({
      docType: "SALES_INVOICE" as const,
      docId: inv.id,
      slug: inv.slug,
      documentNo: inv.documentNo,
      date: inv.date,
      status: String(inv.status),
      customerId: inv.customerId,
      customerName: inv.customer.name,
      salesEmployeeId: inv.salesEmployeeId,
      salesEmployeeName: inv.salesEmployee?.name ?? null,
      subtotal: Number(inv.subtotal),
      headerDiscount: Number(inv.discount),
      grandTotal: Number(inv.grandTotal),
      lines: inv.items.map((i) => ({
        qty: Number(i.qty),
        unitPrice: Number(i.unitPrice),
        discount: Number(i.discount),
      })),
    })),
  ]

  return buildDiscountExposure(inputs, thresholdsByType)
}

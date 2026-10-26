/**
 * Loader read-only antrean faktur penjualan draft mengendap
 * (F-2026-10-26-057-S / 057-B, NOL migrasi).
 *
 * Izin `view_sales_invoices` ditegakkan DI SINI fail-closed sebelum query
 * apa pun (Q-SIQ-5 Lead, PR #967 — tanpa key izin baru); halaman
 * pemanggil menegakkannya juga sebelum loader. Tanpa izin: nol baris
 * bocor (AC-SIQ-B4).
 *
 * Populasi query = SalesInvoice `status: "draft"` + `deletedAt: null`
 * saja (BR-SIQ-01; `approved` TIDAK ikut — Q-SIQ-3); builder menyaring
 * ulang lapis kedua supaya kontrak turunan tidak bergantung pada query
 * saja. Satu query massal faktur (+ nama pelanggan lewat relasi) + query
 * massal nama penjual dari `salesEmployeeId` -> Employee + nomor dokumen
 * SO/penawaran tertaut massal — tanpa N+1. Status approval per baris
 * TIDAK dibaca (Q-SIQ-7).
 *
 * Baca-saja mutlak: tidak memanggil postInvoice/assertApproved, tidak
 * menulis jurnal/status/kolom (BR-SIQ-07, AC-SIQ-B5).
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { salesInvoiceLabel } from "@/lib/utils/invoice-label"
import {
  buildSalesInvoiceDraftQueue,
  summarizeSalesInvoiceDraftQueue,
  SALES_INVOICE_DRAFT_NOTICE_TEXT,
  SALES_INVOICE_DRAFT_LEVEL_LABELS,
  type SalesInvoiceDraftRow,
  type SalesInvoiceDraftLevel,
  type SalesInvoiceDraftSummary,
} from "@/lib/reports/sales-invoice-draft-queue"

export interface SalesInvoiceDraftQueue {
  rows: SalesInvoiceDraftRow[]
  summary: SalesInvoiceDraftSummary
  noticeText: string
  levelLabels: Record<SalesInvoiceDraftLevel, string>
}

export async function getSalesInvoiceDraftQueue(
  now: Date = new Date(),
): Promise<SalesInvoiceDraftQueue> {
  await requirePermission("view_sales_invoices")

  const invoices = await prisma.salesInvoice.findMany({
    where: { status: "draft", deletedAt: null },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      deletedAt: true,
      customerId: true,
      salesEmployeeId: true,
      salesOrderId: true,
      quotationId: true,
      projectId: true,
      date: true,
      dueDate: true,
      createdAt: true,
      grandTotal: true,
      customer: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { documentNo: "asc" }, { id: "asc" }],
  })

  const sellerIds = Array.from(
    new Set(invoices.map((i) => i.salesEmployeeId).filter((id) => id != null)),
  )
  const orderIds = Array.from(
    new Set(invoices.map((i) => i.salesOrderId).filter((id) => id != null)),
  )
  const quotationIds = Array.from(
    new Set(invoices.map((i) => i.quotationId).filter((id) => id != null)),
  )

  const [sellers, orders, quotations] = await Promise.all([
    sellerIds.length > 0
      ? prisma.employee.findMany({
          where: { id: { in: sellerIds } },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
    orderIds.length > 0
      ? prisma.salesOrder.findMany({
          where: { id: { in: orderIds } },
          select: { id: true, documentNo: true },
        })
      : Promise.resolve([]),
    quotationIds.length > 0
      ? prisma.quotation.findMany({
          where: { id: { in: quotationIds } },
          select: { id: true, documentNo: true },
        })
      : Promise.resolve([]),
  ])
  const sellerNameById = new Map(sellers.map((e) => [e.id, e.name]))
  const orderNoById = new Map(orders.map((o) => [o.id, o.documentNo]))
  const quotationNoById = new Map(quotations.map((q) => [q.id, q.documentNo]))

  const rows = buildSalesInvoiceDraftQueue(
    invoices.map((i) => ({
      invoiceId: i.id,
      slug: i.slug,
      documentNo: salesInvoiceLabel(i),
      status: i.status,
      deletedAt: i.deletedAt,
      customerId: i.customerId,
      customerName: i.customer.name,
      salesEmployeeId: i.salesEmployeeId,
      salesEmployeeName: i.salesEmployeeId
        ? (sellerNameById.get(i.salesEmployeeId) ?? null)
        : null,
      salesOrderId: i.salesOrderId,
      salesOrderNo: i.salesOrderId ? (orderNoById.get(i.salesOrderId) ?? null) : null,
      quotationId: i.quotationId,
      quotationNo: i.quotationId ? (quotationNoById.get(i.quotationId) ?? null) : null,
      projectId: i.projectId,
      date: i.date,
      dueDate: i.dueDate,
      createdAt: i.createdAt,
      grandTotal: Number(i.grandTotal),
    })),
    now,
  )

  return {
    rows,
    summary: summarizeSalesInvoiceDraftQueue(rows),
    noticeText: SALES_INVOICE_DRAFT_NOTICE_TEXT,
    levelLabels: SALES_INVOICE_DRAFT_LEVEL_LABELS,
  }
}

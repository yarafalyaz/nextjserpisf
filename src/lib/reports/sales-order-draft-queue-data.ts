/**
 * Loader read-only antrean Pesanan Penjualan draft mengendap
 * (F-2026-10-26-056-S tahap 1, tanpa migrasi/kolom baru).
 *
 * Izin `view_sales_orders` ditegakkan DI SINI fail-closed sebelum query
 * apa pun (Q-SOQ-5: tanpa key baru); halaman pemanggil menegakkannya juga
 * sebelum loader. Tanpa izin: nol baris bocor (AC-SOQ-B4).
 *
 * Populasi query persis BR-SOQ-01: SalesOrder `status: "draft"` +
 * `deletedAt: null`; builder menyaring ulang lapis kedua. Anti-N+1: satu
 * query SalesOrder (+customer/quotation/salesEmployee) — tanpa query
 * massal terpisah. Baca-saja mutlak: nol mutasi SalesOrder/status/jurnal
 * (BR-SOQ-08, AC-SOQ-B5). GrandTotal verbatim tersimpan (Decimal->Number
 * di tepi; rekap berlabel "nilai draft belum disetujui", BR-SOQ-09).
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import {
  buildSalesOrderDraftQueue,
  type SalesOrderDraftInput,
  type SalesOrderDraftQueue,
} from "@/lib/reports/sales-order-draft-queue"

export interface SalesOrderDraftQueueOptions {
  /** Tanggal laporan untuk umur hari (diinjeksikan; default sekarang). */
  now?: Date
}

export async function getSalesOrderDraftQueue(
  options: SalesOrderDraftQueueOptions = {},
): Promise<SalesOrderDraftQueue> {
  await requirePermission("view_sales_orders")

  const orders = await prisma.salesOrder.findMany({
    where: { status: "draft", deletedAt: null },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      deletedAt: true,
      customerId: true,
      quotationId: true,
      salesEmployeeId: true,
      date: true,
      deliveryDate: true,
      createdAt: true,
      grandTotal: true,
      customer: { select: { name: true } },
      quotation: { select: { documentNo: true } },
      salesEmployee: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { documentNo: "asc" }, { id: "asc" }],
  })

  const inputs: SalesOrderDraftInput[] = orders.map((o) => ({
    salesOrderId: o.id,
    slug: o.slug,
    documentNo: o.documentNo,
    status: o.status,
    deletedAt: o.deletedAt,
    customerId: o.customerId,
    customerName: o.customer.name,
    quotationId: o.quotationId,
    quotationDocumentNo: o.quotation?.documentNo ?? null,
    salesEmployeeId: o.salesEmployeeId,
    salesEmployeeName: o.salesEmployee?.name ?? null,
    date: o.date,
    deliveryDate: o.deliveryDate,
    createdAt: o.createdAt,
    grandTotal: Number(o.grandTotal),
  }))

  return buildSalesOrderDraftQueue(inputs, options.now ?? new Date())
}

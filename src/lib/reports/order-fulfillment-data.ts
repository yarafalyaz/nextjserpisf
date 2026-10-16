/**
 * Pemuatan data untuk laporan **Pemenuhan Pesanan** (tutup buku sisi penjualan).
 *
 * Tiga hal yang menentukan benar-tidaknya angka di laporan ini:
 *
 * 1. **Terkirim dijumlahkan dari surat jalan, bukan dibaca dari baris pesanan.**
 *    `SalesOrderItem` tidak punya akumulator seperti `PurchaseOrderItem.receivedQty`,
 *    jadi satu-satunya sumber yang sah adalah `DeliveryOrderItem.salesOrderItemId`.
 * 2. **Hanya surat jalan yang benar-benar jalan yang dihitung**
 *    (`shipped`/`delivered`). Surat jalan `draft` belum keluar dari gudang; ikut
 *    menghitungnya akan membuat pesanan tampak terpenuhi padahal barangnya masih ada.
 * 3. **Pesanan yang sudah ditandai selesai tetap ikut** bila barisnya masih bersisa.
 *    Persis itu yang perlu terlihat: pesanan yang ditutup sementara barangnya belum
 *    semua keluar adalah temuan, bukan baris yang boleh disembunyikan.
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import {
  buildOrderFulfillment,
  type OrderFulfillmentResult,
  type SalesOrderFulfillmentInput,
} from "@/lib/reports/order-fulfillment"

/** Pesanan yang sudah jadi komitmen ke pelanggan. */
export const FULFILLABLE_ORDER_STATUSES = ["confirmed", "processing", "completed"]

/** Surat jalan yang barangnya benar-benar sudah keluar. */
export const SHIPPED_DELIVERY_STATUSES = ["shipped", "delivered"]

export interface OrderFulfillmentReport {
  fulfillment: OrderFulfillmentResult
  periodLabel: string
  periodCaption: string
}

export async function loadOrderFulfillment(period: {
  start: Date
  end: Date
}): Promise<OrderFulfillmentReport> {
  const orders = await prisma.salesOrder.findMany({
    where: {
      date: { gte: period.start, lte: period.end },
      status: { in: FULFILLABLE_ORDER_STATUSES },
    },
    select: {
      id: true,
      documentNo: true,
      date: true,
      status: true,
      customer: { select: { name: true } },
      items: { select: { id: true, itemId: true, description: true, qty: true, unitPrice: true } },
    },
    orderBy: { date: "asc" },
  })

  const lineIds = orders.flatMap((order) => order.items.map((item) => item.id))

  const deliveries = lineIds.length
    ? await prisma.deliveryOrderItem.findMany({
        where: {
          salesOrderItemId: { in: lineIds },
          deliveryOrder: { status: { in: SHIPPED_DELIVERY_STATUSES } },
        },
        select: { salesOrderItemId: true, qty: true },
      })
    : []

  const deliveredByLine = new Map<number, number>()
  for (const delivery of deliveries) {
    if (delivery.salesOrderItemId === null) continue
    const previous = deliveredByLine.get(delivery.salesOrderItemId) ?? 0
    deliveredByLine.set(delivery.salesOrderItemId, previous + Number(delivery.qty))
  }

  const itemIds = [
    ...new Set(
      orders
        .flatMap((order) => order.items.map((item) => item.itemId))
        .filter((id): id is number => id !== null),
    ),
  ]
  const items = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, sku: true, name: true, unitOfMeasure: true },
      })
    : []
  const itemById = new Map(items.map((item) => [item.id, item]))

  const documents: SalesOrderFulfillmentInput[] = orders.map((order) => ({
    documentNo: order.documentNo,
    date: order.date,
    partyName: order.customer?.name ?? null,
    status: order.status,
    items: order.items.map((item) => {
      const detail = item.itemId === null ? undefined : itemById.get(item.itemId)
      return {
        sku: detail?.sku ?? null,
        name: detail?.name ?? item.description ?? "Barang",
        unit: detail?.unitOfMeasure ?? null,
        orderedQty: Number(item.qty),
        fulfilledQty: deliveredByLine.get(item.id) ?? 0,
        unitPrice: Number(item.unitPrice),
      }
    }),
  }))

  return {
    fulfillment: buildOrderFulfillment({ orders: documents, start: period.start, end: period.end }),
    ...rangePeriodLabels(period),
  }
}

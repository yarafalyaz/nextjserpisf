/**
 * Loader read-only antrean SO terkirim belum terfaktur penuh
 * (F-2026-10-26-058-S, tanpa migrasi/kolom baru).
 *
 * Izin `view_reports` ditegakkan DI SINI fail-closed sebelum query apa pun
 * (pola service-reminder-queue-data.ts / sales-price-history-data.ts);
 * halaman pemanggil menegakkannya juga sebelum loader. Tanpa key izin baru
 * (Q-DU-3). Tanpa izin: nol baris bocor (AC-DU-7).
 *
 * Populasi query = `FULFILLABLE_ORDER_STATUSES` (confirmed/processing/
 * completed, order-fulfillment-data.ts) + `deletedAt: null`; builder
 * menyaring ulang lapis kedua (status, terhapus, terkirim, sisa) supaya
 * kontrak turunan tidak bergantung pada query saja.
 *
 * Terkirim memakai definisi existing laporan Pemenuhan Pesanan: Σ
 * DeliveryOrderItem.qty per `salesOrderItemId` dari DeliveryOrder status
 * `SHIPPED_DELIVERY_STATUSES` (shipped/delivered); DO draft tidak terhitung
 * (AC-DU-5). Stempel umur per DO sah ikut dibaca (deliveredAt/confirmedAt/
 * date) — titik umur diputus builder (Q-DU-1).
 *
 * Faktur pengurang dibaca apa adanya per SO (status + deletedAt +
 * grandTotal, dibatasi `salesOrderId` = SO populasi); builder yang memutus
 * mana yang mengurangi (hanya RECOGNISED_AR_STATUSES non-terhapus). Faktur
 * manual tanpa `salesOrderId` tidak pernah terbaca untuk SO mana pun.
 *
 * Saring periode/pelanggan (spec §1 alur antrean): `start`/`end` menyaring
 * tanggal dokumen SO, `customerId` menyaring pelanggan — keduanya opsional;
 * tanpa filter = seluruh populasi. Filter diterapkan di query SO.
 *
 * Anti-N+1: satu query SO (+items/customer) + satu query DeliveryOrderItem
 * massal (beserta DO induknya) + satu query SalesInvoice massal
 * (Promise.all sesudah SO terbaca). Baca-saja mutlak: nol mutasi
 * SalesOrder/DeliveryOrder/SalesInvoice (BR-DU-04, AC-DU-7).
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"
import {
  FULFILLABLE_ORDER_STATUSES,
  SHIPPED_DELIVERY_STATUSES,
} from "@/lib/reports/order-fulfillment-data"
import {
  buildDeliveredUnbilledQueue,
  type DeliveredUnbilledDeliveryInput,
  type DeliveredUnbilledInput,
  type DeliveredUnbilledInvoiceInput,
  type DeliveredUnbilledQueue,
} from "@/lib/reports/delivered-unbilled"

export interface DeliveredUnbilledOptions {
  /** Awal periode (tanggal dokumen SO), inklusif. Kosong = tanpa batas bawah. */
  start?: Date
  /** Akhir periode (tanggal dokumen SO), inklusif. Kosong = tanpa batas atas. */
  end?: Date
  /** Saring satu pelanggan. Kosong = semua pelanggan. */
  customerId?: number
  /** Tanggal laporan untuk umur hari (diinjeksikan; default sekarang). */
  now?: Date
}

export async function getDeliveredUnbilledQueue(
  options: DeliveredUnbilledOptions = {},
): Promise<DeliveredUnbilledQueue> {
  await requirePermission("view_reports")

  const orders = await prisma.salesOrder.findMany({
    where: {
      status: { in: FULFILLABLE_ORDER_STATUSES },
      deletedAt: null,
      ...(options.customerId != null ? { customerId: options.customerId } : {}),
      ...(options.start != null || options.end != null
        ? {
            date: {
              ...(options.start != null ? { gte: options.start } : {}),
              ...(options.end != null ? { lte: options.end } : {}),
            },
          }
        : {}),
    },
    select: {
      id: true,
      slug: true,
      documentNo: true,
      status: true,
      deletedAt: true,
      date: true,
      customer: { select: { name: true } },
      items: {
        select: { id: true, qty: true, unitPrice: true },
        orderBy: [{ id: "asc" }],
      },
    },
    orderBy: [{ date: "asc" }, { documentNo: "asc" }, { id: "asc" }],
  })

  const lineIds = orders.flatMap((order) => order.items.map((item) => item.id))
  const orderIds = orders.map((order) => order.id)

  const [deliveries, invoices] = await Promise.all([
    lineIds.length
      ? prisma.deliveryOrderItem.findMany({
          where: {
            salesOrderItemId: { in: lineIds },
            deliveryOrder: { status: { in: SHIPPED_DELIVERY_STATUSES } },
          },
          select: {
            salesOrderItemId: true,
            qty: true,
            deliveryOrder: {
              select: {
                id: true,
                salesOrderId: true,
                status: true,
                date: true,
                confirmedAt: true,
                deliveredAt: true,
              },
            },
          },
        })
      : Promise.resolve([]),
    orderIds.length
      ? prisma.salesInvoice.findMany({
          where: {
            salesOrderId: { in: orderIds },
            deletedAt: null,
            status: { in: [...RECOGNISED_AR_STATUSES] },
          },
          select: {
            salesOrderId: true,
            status: true,
            deletedAt: true,
            grandTotal: true,
          },
        })
      : Promise.resolve([]),
  ])

  const deliveredByLine = new Map<number, number>()
  const deliveriesByOrder = new Map<number, DeliveredUnbilledDeliveryInput[]>()
  // Agregasi qty per (DO, SO): satu DO bisa memuat banyak baris SO yang sama.
  const qtyByDelivery = new Map<string, DeliveredUnbilledDeliveryInput>()
  for (const delivery of deliveries) {
    if (delivery.salesOrderItemId === null) continue
    const qty = Number(delivery.qty)
    const previous = deliveredByLine.get(delivery.salesOrderItemId) ?? 0
    deliveredByLine.set(delivery.salesOrderItemId, previous + qty)

    const orderId = delivery.deliveryOrder.salesOrderId
    const key = `${delivery.deliveryOrder.id}:${orderId}`
    const existing = qtyByDelivery.get(key)
    if (existing) {
      existing.deliveredQty += qty
    } else {
      const entry: DeliveredUnbilledDeliveryInput = {
        status: delivery.deliveryOrder.status,
        date: delivery.deliveryOrder.date,
        confirmedAt: delivery.deliveryOrder.confirmedAt,
        deliveredAt: delivery.deliveryOrder.deliveredAt,
        deliveredQty: qty,
      }
      qtyByDelivery.set(key, entry)
      const list = deliveriesByOrder.get(orderId) ?? []
      list.push(entry)
      deliveriesByOrder.set(orderId, list)
    }
  }

  const invoicesByOrder = new Map<number, DeliveredUnbilledInvoiceInput[]>()
  for (const invoice of invoices) {
    if (invoice.salesOrderId === null) continue
    const list = invoicesByOrder.get(invoice.salesOrderId) ?? []
    list.push({
      salesOrderId: invoice.salesOrderId,
      status: invoice.status,
      deletedAt: invoice.deletedAt,
      grandTotal: Number(invoice.grandTotal),
    })
    invoicesByOrder.set(invoice.salesOrderId, list)
  }

  const inputs: DeliveredUnbilledInput[] = orders.map((order) => ({
    salesOrderId: order.id,
    slug: order.slug,
    documentNo: order.documentNo,
    status: order.status,
    deletedAt: order.deletedAt,
    date: order.date,
    customerName: order.customer.name,
    lines: order.items.map((item) => ({
      lineId: item.id,
      deliveredQty: deliveredByLine.get(item.id) ?? 0,
      unitPrice: Number(item.unitPrice),
    })),
    deliveries: deliveriesByOrder.get(order.id) ?? [],
    invoices: invoicesByOrder.get(order.id) ?? [],
  }))

  return buildDeliveredUnbilledQueue(inputs, options.now ?? new Date(), FULFILLABLE_ORDER_STATUSES)
}

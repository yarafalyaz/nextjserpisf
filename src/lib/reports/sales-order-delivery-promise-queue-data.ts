/**
 * Loader read-only antrean janji kirim pesanan penjualan
 * (F-2026-10-25-029-S tahap 1, tanpa migrasi).
 *
 * Izin `view_sales_orders` ditegakkan DI SINI fail-closed sebelum query
 * apa pun (BR-SD-08, pola sales-price-history-data.ts); halaman
 * pemanggil menegakkannya juga sebelum loader (pola halaman
 * antrean-penawaran). Tanpa izin: nol baris bocor (AC-SD-08).
 *
 * Populasi query = SO_DELIVERY_PROMISE_POPULATION_STATUSES (gabungan
 * DELIVERABLE/FULFILLABLE minus completed — lihat builder) +
 * `deletedAt: null` + deliveryDate non-null sampai batas jendela
 * due_soon; builder menyaring ulang lapis kedua termasuk sisa terkirim.
 * SO terkirim penuh tetap dibaca query ini lalu dibuang builder
 * (sisa hanya bisa diputuskan sesudah agregasi terkirim).
 *
 * Terkirim memakai definisi existing laporan Pemenuhan Pesanan
 * (BR-SD-02): Σ DeliveryOrderItem.qty per salesOrderItemId dari
 * DeliveryOrder status SHIPPED_DELIVERY_STATUSES (shipped/delivered);
 * draft tidak mengurangi sisa (AC-SD-05).
 *
 * Penanda tanpa-janji (Q-SD-4/BR-SD-06): hitungan terpisah populasi
 * status yang sama dengan deliveryDate null — angka kualitas data,
 * BUKAN baris antrean. SO draft/cancelled tanpa janji tidak ikut
 * (AC-SD-07).
 *
 * Anti-N+1: satu query SO + satu query DeliveryOrderItem massal + satu
 * count penanda (Promise.all). Baca-saja mutlak: nol mutasi
 * SalesOrder/DeliveryOrder/status (AC-SD-10).
 */

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { getWibTodayUtcDate } from "@/lib/utils/attendance-time"
import { SHIPPED_DELIVERY_STATUSES } from "@/lib/reports/order-fulfillment-data"
import {
  buildSalesOrderDeliveryPromiseQueue,
  SO_DELIVERY_PROMISE_DUE_SOON_DAYS,
  SO_DELIVERY_PROMISE_POPULATION_STATUSES,
  type SalesOrderDeliveryPromiseInput,
  type SalesOrderDeliveryPromiseQueue,
} from "@/lib/reports/sales-order-delivery-promise-queue"

const MS_PER_DAY = 86_400_000

export interface SalesOrderDeliveryPromiseResult {
  queue: SalesOrderDeliveryPromiseQueue
  /** SO populasi-status tanpa deliveryDate — penanda saja, bukan baris. */
  withoutPromiseCount: number
}

export async function getSalesOrderDeliveryPromiseQueue(
  now: Date = new Date(),
  dueSoonDays: number = SO_DELIVERY_PROMISE_DUE_SOON_DAYS,
): Promise<SalesOrderDeliveryPromiseResult> {
  await requirePermission("view_sales_orders")

  const today = getWibTodayUtcDate(now)
  const windowEnd = new Date(today.getTime() + dueSoonDays * MS_PER_DAY)
  const population = [...SO_DELIVERY_PROMISE_POPULATION_STATUSES]

  const [orders, withoutPromiseCount] = await Promise.all([
    prisma.salesOrder.findMany({
      where: {
        status: { in: population },
        deletedAt: null,
        deliveryDate: { not: null, lte: windowEnd },
      },
      select: {
        id: true,
        slug: true,
        documentNo: true,
        status: true,
        date: true,
        deliveryDate: true,
        customer: { select: { name: true } },
        salesEmployee: { select: { name: true } },
        items: {
          select: { id: true, qty: true, unitPrice: true },
          orderBy: [{ id: "asc" }],
        },
      },
      orderBy: [{ deliveryDate: "asc" }, { documentNo: "asc" }, { id: "asc" }],
    }),
    prisma.salesOrder.count({
      where: { status: { in: population }, deletedAt: null, deliveryDate: null },
    }),
  ])

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

  const inputs: SalesOrderDeliveryPromiseInput[] = orders.map((order) => ({
    salesOrderId: order.id,
    slug: order.slug,
    documentNo: order.documentNo,
    status: order.status,
    date: order.date,
    deliveryDate: order.deliveryDate,
    customerName: order.customer.name,
    salesEmployeeName: order.salesEmployee?.name ?? null,
    lines: order.items.map((item) => ({
      orderedQty: Number(item.qty),
      deliveredQty: deliveredByLine.get(item.id) ?? 0,
      unitPrice: Number(item.unitPrice),
    })),
  }))

  return {
    queue: buildSalesOrderDeliveryPromiseQueue(inputs, now, dueSoonDays),
    withoutPromiseCount,
  }
}

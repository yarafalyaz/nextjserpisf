/**
 * Data laporan barang diterima sebagian.
 *
 * `PurchaseOrderItem.receivedQty` adalah akumulator yang dipelihara hook
 * penerimaan barang (`goods-receipt.hook`), jadi sisa penerimaan dihitung dari
 * kolom itu — bukan dengan menjumlahkan ulang seluruh penerimaan, yang akan
 * membuka peluang laporan dan pesanan menampilkan angka berbeda.
 *
 * Status pesanan yang masuk: `approved`, `ordered`, `received`, `verified`,
 * `completed`. Draft dan pending belum dipesan ke pemasok (menampilkannya membuat
 * barang yang belum pernah dipesan terlihat seperti pesanan yang belum datang),
 * sedangkan rejected/cancelled memang bukan komitmen.
 */

import { prisma } from "@/lib/db/prisma"
import {
  buildPurchaseOutstanding,
  type PurchaseOutstandingResult,
} from "@/lib/reports/purchase-outstanding"
import { rangePeriodLabels } from "@/lib/reports/period-label"

/** Status pesanan yang berarti komitmen ke pemasok. */
const COMMITTED_PO_STATUSES = ["approved", "ordered", "received", "verified", "completed"]

export interface PurchaseOutstandingReport {
  outstanding: PurchaseOutstandingResult
  periodLabel: string
  periodCaption: string
}

export async function loadPurchaseOutstanding(period: {
  start: Date
  end: Date
}): Promise<PurchaseOutstandingReport> {
  const orders = await prisma.purchaseOrder.findMany({
    where: {
      date: { gte: period.start, lte: period.end },
      status: { in: COMMITTED_PO_STATUSES },
      deletedAt: null,
    },
    select: {
      documentNo: true,
      date: true,
      status: true,
      vendor: { select: { name: true } },
      items: { select: { itemId: true, qty: true, receivedQty: true, unitPrice: true } },
    },
    orderBy: [{ date: "asc" }, { documentNo: "asc" }],
  })

  // `PurchaseOrderItem` tidak punya relasi ke `Item`, jadi nama & satuannya
  // diambil sekali untuk semua baris (Item memakai `sku`, bukan `code`).
  const itemIds = [...new Set(orders.flatMap((order) => order.items.map((item) => item.itemId)))]
  const items = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, sku: true, name: true, unitOfMeasure: true },
      })
    : []
  const itemById = new Map(items.map((item) => [item.id, item]))

  return {
    outstanding: buildPurchaseOutstanding({
      orders: orders.map((order) => ({
        documentNo: order.documentNo,
        date: order.date,
        vendorName: order.vendor?.name ?? null,
        status: order.status,
        items: order.items.map((item) => ({
          sku: itemById.get(item.itemId)?.sku ?? null,
          name: itemById.get(item.itemId)?.name ?? `Barang #${item.itemId}`,
          unit: itemById.get(item.itemId)?.unitOfMeasure ?? null,
          orderedQty: Number(item.qty),
          receivedQty: Number(item.receivedQty),
          unitPrice: Number(item.unitPrice),
        })),
      })),
      start: period.start,
      end: period.end,
    }),
    ...rangePeriodLabels(period),
  }
}

/**
 * Pemuatan data untuk laporan pemeriksaan **Persediaan Terkirim Belum Diterima**.
 *
 * Sumbernya pemindahan berstatus `processed` — itu saat stok sudah keluar dari
 * gudang asal tetapi belum masuk gudang tujuan (`processInventoryTransfer` lalu
 * `receiveInventoryTransfer`).
 *
 * Nilai diambil dari **pergerakan stok OUT** milik pemindahan itu
 * (`StockMove` `referenceType: "InventoryTransfer"`, `impact: "OUT"`, `status: "posted"`),
 * karena di situlah harga lot yang benar-benar keluar tercatat. Bila pergerakannya
 * tidak ditemukan (data lama), barisnya tetap ditampilkan tetapi ditandai sebagai
 * perkiraan dan memakai harga pokok barang saat ini — laporan tidak boleh
 * menampilkan nilai pasti yang sebetulnya tidak diketahui.
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import { safeAdd, safeMultiply } from "@/lib/utils/math"
import {
  buildTransferInTransit,
  type TransferInTransitResult,
} from "@/lib/reports/transfer-in-transit"

/** Status pemindahan yang berarti barang masih di jalan. */
export const IN_TRANSIT_TRANSFER_STATUS = "processed"

/** Akumulasi nilai per pemindahan+barang dari pergerakan stok, persis sen. */
export function aggregateTransferMoves(
  moves: { referenceId: number | null; itemId: number; qty: unknown; cost: unknown }[],
): Map<string, { qty: number; value: number }> {
  const valueByKey = new Map<string, { qty: number; value: number }>()
  for (const move of moves) {
    if (move.referenceId === null) continue
    const key = `${move.referenceId}-${move.itemId}`
    const previous = valueByKey.get(key) ?? { qty: 0, value: 0 }
    previous.qty = safeAdd(previous.qty, Number(move.qty), 2)
    previous.value = safeAdd(previous.value, safeMultiply(Number(move.qty), Number(move.cost), 2), 2)
    valueByKey.set(key, previous)
  }
  return valueByKey
}

export interface TransferInTransitReport {
  report: TransferInTransitResult
  periodLabel: string
  periodCaption: string
}

export async function loadTransferInTransit(period: {
  start: Date
  end: Date
}): Promise<TransferInTransitReport> {
  const transfers = await prisma.inventoryTransfer.findMany({
    where: {
      status: IN_TRANSIT_TRANSFER_STATUS,
      date: { gte: period.start, lte: period.end },
    },
    select: {
      id: true,
      documentNo: true,
      date: true,
      sourceWarehouse: { select: { name: true } },
      destinationWarehouse: { select: { name: true } },
      items: { select: { itemId: true, qty: true } },
    },
    orderBy: { date: "asc" },
  })

  const transferIds = transfers.map((transfer) => transfer.id)

  const moves = transferIds.length
    ? await prisma.stockMove.findMany({
        where: {
          referenceType: "InventoryTransfer",
          referenceId: { in: transferIds },
          impact: "OUT",
          status: "posted",
        },
        select: { referenceId: true, itemId: true, qty: true, cost: true },
      })
    : []

  /** Nilai per pemindahan+barang dari pergerakan aslinya. */
  const valueByKey = aggregateTransferMoves(moves)

  const itemIds = [...new Set(transfers.flatMap((transfer) => transfer.items.map((item) => item.itemId)))]
  const items = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, sku: true, name: true, unitOfMeasure: true, cost: true },
      })
    : []
  const itemById = new Map(items.map((item) => [item.id, item]))

  const today = new Date()
  const periodEndIsToday =
    period.end.getFullYear() === today.getFullYear() &&
    period.end.getMonth() === today.getMonth() &&
    period.end.getDate() === today.getDate()

  return {
    report: buildTransferInTransit({
      transfers: transfers.map((transfer) => ({
        documentNo: transfer.documentNo,
        date: transfer.date,
        sourceName: transfer.sourceWarehouse?.name ?? "–",
        destinationName: transfer.destinationWarehouse?.name ?? "–",
        items: transfer.items.map((item) => {
          const detail = itemById.get(item.itemId)
          const moved = valueByKey.get(`${transfer.id}-${item.itemId}`)
          const unitCost = moved && moved.qty > 0 ? moved.value / moved.qty : detail ? Number(detail.cost ?? 0) : null
          return {
            sku: detail?.sku ?? null,
            name: detail?.name ?? "Barang",
            unit: detail?.unitOfMeasure ?? null,
            qty: moved ? moved.qty : Number(item.qty),
            unitCost: moved ? unitCost : detail ? Number(detail.cost ?? 0) : null,
          }
        }),
      })),
      asOf: period.end,
      periodEndIsToday,
    }),
    ...rangePeriodLabels(period),
  }
}

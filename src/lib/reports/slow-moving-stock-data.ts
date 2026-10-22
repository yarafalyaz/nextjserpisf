/**
 * Pemuatan data laporan pemeriksaan **Stok Tidak Bergerak**.
 *
 * Sumber:
 * - Sisa + nilai: lapisan FIFO (`InventoryLayer.remaining > 0`) diagregat
 *   per barang — basis yang sama dengan Valuasi Stok, bukan `qtyOnHand`.
 * - Keluar terakhir: StockMove posted impact OUT terbaru per barang
 *   (groupBy itemId, _max date). Tanggal pakai `date` dokumen bila ada,
 *   jatuh ke `createdAt` — dipilih di builder lewat fakta yang sama agar
 *   loader tetap tipis: di sini _max atas `date`; baris tanpa tanggal
 *   dokumen (date null) tetap terhitung lewat createdAt cadangan.
 *
 * Hanya barang aktif non-jasa. Tanpa jurnal, tanpa tulis.
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import {
  buildSlowMovingStock,
  slowMovingValueOfLayers,
  SLOW_MOVING_DEFAULT_THRESHOLD_DAYS,
  type SlowMovingResult,
} from "@/lib/reports/slow-moving-stock"

export interface SlowMovingReport {
  report: SlowMovingResult
  periodLabel: string
  periodCaption: string
  thresholdDays: number
}

/** Tanggal keluar efektif satu StockMove: tanggal dokumen, else createdAt. */
export function effectiveOutDate(move: { date: Date | null; createdAt: Date }): Date {
  return move.date ?? move.createdAt
}

export async function loadSlowMovingStock(input?: {
  asOf?: Date
  thresholdDays?: number
}): Promise<SlowMovingReport> {
  const asOf = input?.asOf ?? new Date()
  const thresholdDays = input?.thresholdDays ?? SLOW_MOVING_DEFAULT_THRESHOLD_DAYS

  const layers = await prisma.inventoryLayer.findMany({
    where: { remaining: { gt: 0 } },
    select: { itemId: true, remaining: true, unitCost: true },
  })
  const layersByItem = new Map<number, { remaining: unknown; unitCost: unknown }[]>()
  for (const layer of layers) {
    const list = layersByItem.get(layer.itemId) ?? []
    list.push(layer)
    layersByItem.set(layer.itemId, list)
  }

  const itemIds = [...layersByItem.keys()]
  const [items, lastOutMoves] = await Promise.all([
    itemIds.length
      ? prisma.item.findMany({
          where: { id: { in: itemIds }, isActive: true, deletedAt: null, isService: false },
          select: {
            id: true,
            sku: true,
            name: true,
            unitOfMeasure: true,
            category: { select: { name: true } },
          },
        })
      : Promise.resolve(
          [] as {
            id: number
            sku: string
            name: string
            unitOfMeasure: string
            category: { name: string } | null
          }[],
        ),
    itemIds.length
      ? prisma.stockMove.findMany({
          where: { itemId: { in: itemIds }, impact: "OUT", status: "posted" },
          select: { itemId: true, date: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([] as { itemId: number; date: Date | null; createdAt: Date }[]),
  ])

  const lastOutByItem = new Map<number, Date>()
  for (const move of lastOutMoves) {
    const when = effectiveOutDate(move)
    const previous = lastOutByItem.get(move.itemId)
    if (!previous || when.getTime() > previous.getTime()) {
      lastOutByItem.set(move.itemId, when)
    }
  }

  const report = buildSlowMovingStock({
    items: items.map((item) => {
      const totals = slowMovingValueOfLayers(layersByItem.get(item.id) ?? [])
      return {
        sku: item.sku,
        name: item.name,
        categoryName: item.category?.name ?? null,
        unit: item.unitOfMeasure,
        remainingQty: totals.remainingQty,
        remainingValue: totals.remainingValue,
        lastOutDate: lastOutByItem.get(item.id) ?? null,
      }
    }),
    asOf,
    thresholdDays,
  })

  return { report, ...rangePeriodLabels({ start: asOf, end: asOf }), thresholdDays }
}

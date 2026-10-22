/**
 * Pemuatan data laporan pemeriksaan **Stok Tidak Bergerak**.
 *
 * Sumber:
 * - Sisa + nilai: lapisan sisa > 0 dimuat `findMany`, dipetakan lewat
 *   `toValuationLayers` lalu dinilai per barang lewat jalur kanonis
 *   Valuasi Stok (`resolveCostingMethod` + `layerValue`: average dari
 *   `Item.cost`, fifo dari harga lapisan) — bukan `qtyOnHand`.
 * - Keluar terakhir: StockMove posted impact OUT barang bersisa dimuat
 *   `findMany`, lalu tanggal efektif terbaru dipilih di memori per
 *   barang (tanggal dokumen bila ada, jatuh ke `createdAt` — lihat
 *   `effectiveOutDate`). Tanpa batas baris; diterima untuk laporan
 *   pemeriksaan, utang performa bila volume move besar.
 *
 * Hanya barang aktif non-jasa. Tanpa jurnal, tanpa tulis.
 */

import { prisma } from "@/lib/db/prisma"
import { getSystemSettings } from "@/lib/utils/settings"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import { toValuationLayers } from "@/lib/reports/stock-valuation"
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

  const settings = await getSystemSettings()

  const rawLayers = await prisma.inventoryLayer.findMany({
    where: {
      remaining: { gt: 0 },
      item: { isActive: true, deletedAt: null, isService: false },
    },
    select: {
      itemId: true,
      warehouseId: true,
      remaining: true,
      unitCost: true,
      item: {
        select: {
          sku: true,
          name: true,
          unitOfMeasure: true,
          cost: true,
          costingMethod: true,
          category: { select: { name: true, costingMethod: true } },
        },
      },
    },
  })

  const itemIds = [...new Set(rawLayers.map((layer) => layer.itemId))]
  const lastOutMoves = itemIds.length
    ? await prisma.stockMove.findMany({
        where: { itemId: { in: itemIds }, impact: "OUT", status: "posted" },
        select: { itemId: true, date: true, createdAt: true },
      })
    : []

  const lastOutByItem = new Map<number, Date>()
  for (const move of lastOutMoves) {
    const when = effectiveOutDate(move)
    const previous = lastOutByItem.get(move.itemId)
    if (!previous || when.getTime() > previous.getTime()) {
      lastOutByItem.set(move.itemId, when)
    }
  }

  const layersByItem = new Map<number, ReturnType<typeof toValuationLayers>>()
  for (const layer of toValuationLayers(rawLayers)) {
    const list = layersByItem.get(layer.itemId) ?? []
    list.push(layer)
    layersByItem.set(layer.itemId, list)
  }

  const report = buildSlowMovingStock({
    items: [...layersByItem.entries()].map(([itemId, itemLayers]) => {
      const first = itemLayers[0]
      const totals = slowMovingValueOfLayers(itemLayers, settings.costingMethod)
      return {
        sku: first.item.sku,
        name: first.item.name,
        categoryName: first.item.category?.name ?? null,
        unit: first.item.unitOfMeasure,
        remainingQty: totals.remainingQty,
        remainingValue: totals.remainingValue,
        lastOutDate: lastOutByItem.get(itemId) ?? null,
      }
    }),
    asOf,
    thresholdDays,
  })

  return { report, ...rangePeriodLabels({ start: asOf, end: asOf }), thresholdDays }
}

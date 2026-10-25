/**
 * Pemuatan data titik pesan-ulang per (barang, gudang) —
 * F-2026-10-25-048-S, putusan Lead 2026-10-26 00:40 WIB (Q-ROP-1/2/3).
 *
 * Baca-saja, query massal tanpa N+1:
 * - Pasangan dinilai dari sisa InventoryLayer per (barang, gudang)
 *   (pola min-stock-data: hanya pasangan berlapisan yang punya stok
 *   terbaca; pasangan tanpa lapisan masuk ember tidak_dinilai lewat
 *   baris setting/lead-time di bawah, bukan dianggap 0).
 * - Minimum efektif dari resolver existing `min-stock-effective`
 *   (override ItemWarehouseSetting > Item.minStock global) — dilarang
 *   ambang kedua (BR-ROP-01).
 * - Laju pakai (Q-ROP-1): MaterialIssue status `completed` per gudang,
 *   termasuk issue ber-projectId/workOrderId, tanggal dalam 90 hari
 *   kalender WIB terakhir inklusif hari ini; laju harian = total qty
 *   MaterialIssueItem / 90.
 * - PO masuk: PurchaseOrder TANPA warehouseId, jadi sisa terbuka
 *   (ordered/partial_received, qty − receivedQty clamp >= 0) dihitung
 *   per BARANG dan diteruskan apa adanya (lihat reorder-point.ts).
 * - Barang jasa/nonaktif/terhapus tidak dinilai (AC-ROP-B5, pola
 *   loader existing).
 */

import { prisma } from "@/lib/db/prisma"
import { effectiveMinStock } from "@/lib/reports/min-stock-effective"
import {
  buildReorderPoints,
  type ReorderPointResult,
} from "@/lib/reports/reorder-point"
import { OPEN_PURCHASE_ORDER_STATUSES } from "@/lib/reports/bom-revision-impact"

export const REORDER_POINT_USAGE_WINDOW_DAYS = 90

export interface ReorderPointReport {
  result: ReorderPointResult
  usageWindowDays: number
  /** Awal jendela laju (00:00 WIB hari pertama, inklusif). */
  usageWindowStart: Date
}

export async function loadReorderPoints(now = new Date()): Promise<ReorderPointReport> {
  // Jendela 90 hari kalender WIB inklusif hari ini: mulai 00:00 WIB
  // 89 hari lalu. Server berjalan TZ=Asia/Jakarta (pola date-only repo),
  // jadi tengah malam lokal = tengah malam WIB.
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  start.setDate(start.getDate() - (REORDER_POINT_USAGE_WINDOW_DAYS - 1))

  const items = await prisma.item.findMany({
    where: { isActive: true, deletedAt: null, isService: false },
    select: { id: true, sku: true, name: true, unitOfMeasure: true, minStock: true },
    orderBy: { sku: "asc" },
  })
  if (items.length === 0) {
    return { result: buildReorderPoints([]), usageWindowDays: REORDER_POINT_USAGE_WINDOW_DAYS, usageWindowStart: start }
  }
  const itemIds = items.map((i) => i.id)
  const itemById = new Map(items.map((i) => [i.id, i]))

  const [settings, layers, issues, openPos] = await Promise.all([
    prisma.itemWarehouseSetting.findMany({
      where: { itemId: { in: itemIds } },
      select: { itemId: true, warehouseId: true, minStock: true, leadTimeDays: true },
    }),
    prisma.inventoryLayer.findMany({
      where: { itemId: { in: itemIds } },
      select: { itemId: true, warehouseId: true, remaining: true },
    }),
    prisma.materialIssue.findMany({
      where: { status: "completed", date: { gte: start } },
      select: {
        warehouseId: true,
        items: { where: { itemId: { in: itemIds } }, select: { itemId: true, qty: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { status: { in: [...OPEN_PURCHASE_ORDER_STATUSES] }, deletedAt: null },
      select: {
        items: {
          where: { itemId: { in: itemIds } },
          select: { itemId: true, qty: true, receivedQty: true },
        },
      },
    }),
  ])

  const settingByPair = new Map(
    settings.map((s) => [`${s.itemId}:${s.warehouseId}`, s]),
  )
  const qtyByPair = new Map<string, number>()
  for (const layer of layers) {
    if (layer.warehouseId == null) continue
    const key = `${layer.itemId}:${layer.warehouseId}`
    qtyByPair.set(key, (qtyByPair.get(key) ?? 0) + Number(layer.remaining))
  }
  const usageByPair = new Map<string, number>()
  for (const issue of issues) {
    for (const line of issue.items) {
      const key = `${line.itemId}:${issue.warehouseId}`
      usageByPair.set(key, (usageByPair.get(key) ?? 0) + Number(line.qty))
    }
  }
  const incomingByItem = new Map<number, number>()
  for (const po of openPos) {
    for (const line of po.items) {
      const remaining = Math.max(0, Number(line.qty) - Number(line.receivedQty))
      if (remaining > 0) {
        incomingByItem.set(line.itemId, (incomingByItem.get(line.itemId) ?? 0) + remaining)
      }
    }
  }

  // Semesta pasangan: yang berlapisan ATAU punya baris setting (supaya
  // pasangan ber-lead-time tanpa lapisan tetap terhitung tidak_dinilai,
  // BR-ROP-05). Gudang pasangan tanpa lapisan: nama dari master gudang.
  const pairKeys = new Set([...qtyByPair.keys(), ...settingByPair.keys()])
  const warehouseIds = [...new Set([...pairKeys].map((k) => Number(k.split(":")[1])))]
  const warehouses = warehouseIds.length
    ? await prisma.warehouse.findMany({
        where: { id: { in: warehouseIds } },
        select: { id: true, name: true },
      })
    : []
  const warehouseNameById = new Map(warehouses.map((w) => [w.id, w.name]))

  const rows = [...pairKeys].flatMap((key) => {
    const [itemIdRaw, warehouseIdRaw] = key.split(":")
    const item = itemById.get(Number(itemIdRaw))
    if (!item) return []
    const warehouseId = Number(warehouseIdRaw)
    const setting = settingByPair.get(key)
    const effective = effectiveMinStock(
      Number(item.minStock),
      setting?.minStock != null ? Number(setting.minStock) : undefined,
    )
    return [{
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      unit: item.unitOfMeasure,
      warehouseId,
      warehouseName: warehouseNameById.get(warehouseId) ?? `Gudang #${warehouseId}`,
      qtyAtWarehouse: qtyByPair.has(key) ? qtyByPair.get(key)! : null,
      minStock: effective.minStock,
      minStockSource: effective.source,
      leadTimeDays: setting?.leadTimeDays ?? null,
      dailyUsage: (usageByPair.get(key) ?? 0) / REORDER_POINT_USAGE_WINDOW_DAYS,
      incomingQty: incomingByItem.get(item.id) ?? 0,
    }]
  })

  return {
    result: buildReorderPoints(rows),
    usageWindowDays: REORDER_POINT_USAGE_WINDOW_DAYS,
    usageWindowStart: start,
  }
}

/**
 * Penilaian stok menipis per (barang, gudang) —
 * F-2026-10-22-070-S (induk F-2026-10-21-013, BR-MS-02/03/05).
 *
 * Pure (tanpa Prisma): sisa lapisan per pasangan dibandingkan ke minimum
 * EFEKTIF (override ItemWarehouseSetting, selain itu Item.minStock global).
 * Pasangan tanpa lapisan tidak dinilai. Dipakai cron peringatan menipis;
 * loader laporan memakai builder `buildMinStockByWarehouse` dengan
 * resolusi efektif yang sama (`min-stock-effective`).
 */

import { effectiveMinStock, minStockOverrideByPair, type MinStockSettingRow } from "@/lib/reports/min-stock-effective"

export interface WarehouseStockPair {
  itemId: number
  itemName: string
  warehouseId: number
  warehouseName: string
  qtyAtWarehouse: number
}

export interface WarehouseLowStockLine extends WarehouseStockPair {
  minStock: number
  minStockSource: "override" | "global"
}

export function findWarehouseLowStock(args: {
  items: readonly { id: number; name: string; minStock: number }[]
  pairs: readonly WarehouseStockPair[]
  settings: readonly MinStockSettingRow[]
}): WarehouseLowStockLine[] {
  const itemById = new Map(args.items.map((i) => [i.id, i]))
  const overrideByPair = minStockOverrideByPair(args.settings)
  const low: WarehouseLowStockLine[] = []
  for (const pair of args.pairs) {
    const item = itemById.get(pair.itemId)
    if (!item) continue
    const effective = effectiveMinStock(item.minStock, overrideByPair.get(`${pair.itemId}:${pair.warehouseId}`))
    if (effective.minStock > 0 && pair.qtyAtWarehouse <= effective.minStock) {
      low.push({ ...pair, minStock: effective.minStock, minStockSource: effective.source })
    }
  }
  return low.sort(
    (a, b) => a.itemName.localeCompare(b.itemName, "id-ID") || a.warehouseName.localeCompare(b.warehouseName, "id-ID"),
  )
}

/**
 * Muat pasangan menipis per gudang dari Prisma: barang aktif non-jasa,
 * override-nya, dan sisa InventoryLayer per (barang, gudang).
 * Query massal (3 query), tanpa N+1.
 */
export async function loadWarehouseLowStock(): Promise<WarehouseLowStockLine[]> {
  const { prisma } = await import("@/lib/db/prisma")
  const items = await prisma.item.findMany({
    where: { isActive: true, deletedAt: null, isService: false },
    select: { id: true, name: true, minStock: true },
  })
  if (items.length === 0) return []
  const itemIds = items.map((i) => i.id)
  const [settings, layers] = await Promise.all([
    prisma.itemWarehouseSetting.findMany({
      where: { itemId: { in: itemIds } },
      select: { itemId: true, warehouseId: true, minStock: true },
    }),
    prisma.inventoryLayer.findMany({
      where: { itemId: { in: itemIds } },
      select: { itemId: true, warehouseId: true, remaining: true },
    }),
  ])
  const itemIdsWithOverride = new Set(settings.filter((s) => s.minStock != null).map((s) => s.itemId))
  const relevant = new Set(
    items.filter((i) => Number(i.minStock) > 0 || itemIdsWithOverride.has(i.id)).map((i) => i.id),
  )
  const qtyByPair = new Map<string, { itemId: number; warehouseId: number; qty: number }>()
  for (const layer of layers) {
    if (layer.warehouseId == null || !relevant.has(layer.itemId)) continue
    const key = `${layer.itemId}:${layer.warehouseId}`
    const cur = qtyByPair.get(key) ?? { itemId: layer.itemId, warehouseId: layer.warehouseId, qty: 0 }
    cur.qty += Number(layer.remaining)
    qtyByPair.set(key, cur)
  }
  if (qtyByPair.size === 0) return []
  const warehouseIds = [...new Set([...qtyByPair.values()].map((p) => p.warehouseId))]
  const warehouses = await prisma.warehouse.findMany({
    where: { id: { in: warehouseIds } },
    select: { id: true, name: true },
  })
  const warehouseNameById = new Map(warehouses.map((w) => [w.id, w.name]))
  const itemById = new Map(items.map((i) => [i.id, i]))
  return findWarehouseLowStock({
    items: items.map((i) => ({ id: i.id, name: i.name, minStock: Number(i.minStock) })),
    settings: settings.map((s) => ({ itemId: s.itemId, warehouseId: s.warehouseId, minStock: s.minStock == null ? null : Number(s.minStock) })),
    pairs: [...qtyByPair.values()].map((p) => ({
      itemId: p.itemId,
      itemName: itemById.get(p.itemId)?.name ?? `#${p.itemId}`,
      warehouseId: p.warehouseId,
      warehouseName: warehouseNameById.get(p.warehouseId) ?? `Gudang #${p.warehouseId}`,
      qtyAtWarehouse: p.qty,
    })),
  })
}

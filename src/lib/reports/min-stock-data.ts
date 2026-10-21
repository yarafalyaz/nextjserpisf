/**
 * Pemuatan data untuk laporan **Barang Stok Minimum**.
 *
 * Semua barang aktif ikut dibaca, bukan hanya yang di bawah minimum: mesin
 * laporan perlu tahu apakah ADA barang yang batas minimumnya sudah diisi, supaya
 * bisa membedakan "belum ada yang mencapai minimum" dari "batas minimumnya belum
 * pernah diisi" — dua hal yang kalau disamakan akan membuat daftar kosong terbaca
 * seolah semua stok aman.
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import { buildMinStock, buildMinStockByWarehouse, type MinStockResult } from "@/lib/reports/min-stock"

/**
 * F-2026-10-21-013: label kejujuran lapis aman per gudang. Minimum yang
 * dibandingkan tetap global Item.minStock — inti ItemWarehouseSetting
 * (minimum per gudang) belum ada. Frontend tempel teks ini verbatim di
 * dekat daftar per gudang; jangan parafrase jadi klaim minimum per gudang.
 */
export const MIN_STOCK_WAREHOUSE_NOTE =
  "Per gudang: minimum masih global — batas Item.minStock yang sama dibandingkan ke stok tiap gudang; minimum per gudang belum diatur."

export interface MinStockReport {
  report: MinStockResult
  /** F-013 lapis aman: baris di bawah minimum per gudang (minimum masih global). */
  warehouseShortages: import("@/lib/reports/min-stock").MinStockWarehouseLine[]
  /** Teks verbatim untuk UI: minimum masih global (lihat MIN_STOCK_WAREHOUSE_NOTE). */
  warehouseNote: string
  periodLabel: string
  periodCaption: string
}

export async function loadMinStock(period: {
  start: Date
  end: Date
}): Promise<MinStockReport> {
  const items = await prisma.item.findMany({
    where: { isActive: true, deletedAt: null, isService: false },
    select: {
      id: true,
      sku: true,
      name: true,
      unitOfMeasure: true,
      qtyOnHand: true,
      minStock: true,
      cost: true,
      category: { select: { name: true } },
      warehouse: { select: { name: true } },
      vendor: { select: { name: true } },
    },
    orderBy: { sku: "asc" },
  })

  // F-013 lapis aman: sisa lapisan per (barang, gudang) untuk baris per
  // gudang. Hanya pasangan yang pernah punya lapisan yang dinilai.
  const withMin = items.filter((i) => Number(i.minStock) > 0)
  const layers = withMin.length
    ? await prisma.inventoryLayer.findMany({
        where: { itemId: { in: withMin.map((i) => i.id) } },
        select: { itemId: true, warehouseId: true, remaining: true },
      })
    : []
  const warehouseIds = [...new Set(layers.map((l) => l.warehouseId).filter((id): id is number => id != null))]
  const warehouses = warehouseIds.length
    ? await prisma.warehouse.findMany({ where: { id: { in: warehouseIds } }, select: { id: true, name: true } })
    : []
  const warehouseNameById = new Map(warehouses.map((w) => [w.id, w.name]))
  const qtyByPair = new Map<string, number>()
  for (const layer of layers) {
    if (layer.warehouseId == null) continue
    const key = `${layer.itemId}:${layer.warehouseId}`
    qtyByPair.set(key, (qtyByPair.get(key) ?? 0) + Number(layer.remaining))
  }
  const itemById = new Map(items.map((i) => [i.id, i]))
  const warehouseShortages = buildMinStockByWarehouse(
    [...qtyByPair.entries()].flatMap(([key, qty]) => {
      const [itemIdRaw, warehouseIdRaw] = key.split(":")
      const item = itemById.get(Number(itemIdRaw))
      if (!item) return []
      return [{
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        warehouseId: Number(warehouseIdRaw),
        warehouseName: warehouseNameById.get(Number(warehouseIdRaw)) ?? `Gudang #${warehouseIdRaw}`,
        qtyAtWarehouse: qty,
        minStock: Number(item.minStock),
        cost: Number(item.cost ?? 0),
      }]
    }),
  )

  return {
    warehouseShortages,
    warehouseNote: MIN_STOCK_WAREHOUSE_NOTE,
    report: buildMinStock(
      items.map((item) => ({
        itemId: item.id,
        sku: item.sku,
        name: item.name,
        unit: item.unitOfMeasure,
        categoryName: item.category?.name ?? null,
        warehouseName: item.warehouse?.name ?? null,
        vendorName: item.vendor?.name ?? null,
        qtyOnHand: Number(item.qtyOnHand),
        minStock: Number(item.minStock),
        cost: Number(item.cost ?? 0),
      })),
    ),
    ...rangePeriodLabels(period),
  }
}

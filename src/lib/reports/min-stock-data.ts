/**
 * Pemuatan data untuk laporan **Barang Stok Minimum**.
 *
 * Semua barang aktif ikut dibaca, bukan hanya yang di bawah minimum: mesin
 * laporan perlu tahu apakah ADA barang yang batas minimumnya sudah diisi, supaya
 * bisa membedakan "belum ada yang mencapai minimum" dari "batas minimumnya belum
 * pernah diisi" — dua hal yang kalau disamakan akan membuat daftar kosong terbaca
 * seolah semua stok aman.
 *
 * F-2026-10-22-070-S (BR-MS-02/04): minimum efektif per (barang, gudang) =
 * override `ItemWarehouseSetting.minStock` bila baris setting ada
 * (`minStockSource: "override"`, label "Minimum per gudang"), selain itu
 * warisi `Item.minStock` global (`minStockSource: "global"`).
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import { buildMinStock, buildMinStockByWarehouse, type MinStockResult } from "@/lib/reports/min-stock"
import { effectiveMinStock, minStockOverrideByPair } from "@/lib/reports/min-stock-effective"

/**
 * Label kejujuran per baris warisi global (BR-MS-04). Selama masih ada
 * baris yang mewarisi minimum global, note ini WAJIB tampil apa adanya;
 * baris ber-override membawa `minStockSource: "override"` + label
 * MIN_STOCK_OVERRIDE_LABEL. Frontend tempel verbatim; jangan parafrase.
 */
export const MIN_STOCK_WAREHOUSE_NOTE =
  "Per gudang: minimum masih global — batas Item.minStock yang sama dibandingkan ke stok tiap gudang; minimum per gudang belum diatur."

/** Label sumber untuk baris dengan override per gudang (BR-MS-04). */
export const MIN_STOCK_OVERRIDE_LABEL = "Minimum per gudang"

/** Label sumber untuk baris yang mewarisi minimum global. */
export const MIN_STOCK_GLOBAL_LABEL = "Minimum global (warisi)"

export interface MinStockReport {
  report: MinStockResult
  /** Baris di bawah minimum per gudang dengan minimum efektif per pasangan. */
  warehouseShortages: import("@/lib/reports/min-stock").MinStockWarehouseLine[]
  /** Teks verbatim untuk UI: kejujuran cakupan minimum (lihat MIN_STOCK_WAREHOUSE_NOTE). */
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

  // Override per (barang, gudang): satu query massal untuk semua barang.
  const settings = items.length
    ? await prisma.itemWarehouseSetting.findMany({
        where: { itemId: { in: items.map((i) => i.id) } },
        select: { itemId: true, warehouseId: true, minStock: true },
      })
    : []
  const overrideByPair = minStockOverrideByPair(
    settings.map((s) => ({ itemId: s.itemId, warehouseId: s.warehouseId, minStock: s.minStock == null ? null : Number(s.minStock) })),
  )

  // Sisa lapisan per (barang, gudang). Hanya pasangan yang pernah punya
  // lapisan yang dinilai (BR-MS-03). Barang dinilai bila minimum global
  // ATAU salah satu override-nya > 0.
  const itemIdsWithOverride = new Set(settings.filter((s) => s.minStock != null).map((s) => s.itemId))
  const withMin = items.filter((i) => Number(i.minStock) > 0 || itemIdsWithOverride.has(i.id))
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
  const warehouseRows = [...qtyByPair.entries()].flatMap(([key, qty]) => {
    const [itemIdRaw, warehouseIdRaw] = key.split(":")
    const item = itemById.get(Number(itemIdRaw))
    if (!item) return []
    const effective = effectiveMinStock(Number(item.minStock), overrideByPair.get(key))
    return [{
      itemId: item.id,
      sku: item.sku,
      name: item.name,
      warehouseId: Number(warehouseIdRaw),
      warehouseName: warehouseNameById.get(Number(warehouseIdRaw)) ?? `Gudang #${warehouseIdRaw}`,
      qtyAtWarehouse: qty,
      minStock: effective.minStock,
      minStockSource: effective.source,
      cost: Number(item.cost ?? 0),
    }]
  })
  const warehouseShortages = buildMinStockByWarehouse(warehouseRows)

  // Note kejujuran (BR-MS-04): selama ada pasangan warisi yang dinilai,
  // note global lama tetap tampil; hanya bila SEMUA pasangan yang dinilai
  // ber-override note diganti pernyataan per gudang.
  const allAssessedOverride =
    warehouseRows.length > 0 && warehouseRows.every((r) => r.minStockSource === "override")
  const warehouseNote = allAssessedOverride
    ? "Per gudang: semua batas memakai minimum per gudang (ItemWarehouseSetting); tidak ada baris yang mewarisi minimum global."
    : MIN_STOCK_WAREHOUSE_NOTE

  return {
    warehouseShortages,
    warehouseNote,
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

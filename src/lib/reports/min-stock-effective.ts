/**
 * Resolusi minimum stok efektif per (barang, gudang) —
 * F-2026-10-22-070-S (induk F-2026-10-21-013, BR-MS-02).
 *
 * Pure (tanpa Prisma): baris `ItemWarehouseSetting` ada untuk pasangan
 * (itemId, warehouseId) → minimum efektif = override itu dengan sumber
 * "override"; tidak ada baris → warisi `Item.minStock` global dengan
 * sumber "global". Dipakai bersama oleh loader laporan stok-minimum dan
 * cron peringatan menipis supaya keduanya menilai dari sumber yang sama.
 */

import type { MinStockSource } from "@/lib/reports/min-stock"

export interface MinStockSettingRow {
  itemId: number
  warehouseId: number
  minStock: number
}

export interface EffectiveMinStock {
  minStock: number
  source: MinStockSource
}

export function effectiveMinStock(
  globalMinStock: number,
  override: number | null | undefined,
): EffectiveMinStock {
  return override != null
    ? { minStock: override, source: "override" }
    : { minStock: globalMinStock, source: "global" }
}

/** Indeks override per kunci "itemId:warehouseId" untuk pencarian O(1). */
export function minStockOverrideByPair(
  settings: readonly MinStockSettingRow[],
): Map<string, number> {
  const byPair = new Map<string, number>()
  for (const setting of settings) {
    byPair.set(`${setting.itemId}:${setting.warehouseId}`, setting.minStock)
  }
  return byPair
}

/**
 * Resolusi minimum stok efektif per (barang, gudang) —
 * F-2026-10-22-070-S (induk F-2026-10-21-013, BR-MS-02).
 *
 * Pure (tanpa Prisma): `minStock` baris = override eksplisit per pasangan;
 * null (baris lahir dari lead time, atau tidak ada baris) → warisi
 * `Item.minStock` global (BR-ROP-01). Dipakai bersama loader laporan
 * stok-minimum dan cron peringatan menipis.
 */

import type { MinStockSource } from "@/lib/reports/min-stock"

export interface MinStockSettingRow {
  itemId: number
  warehouseId: number
  minStock: number | null
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

/** Indeks override eksplisit; minStock null diteruskan sebagai null. */
export function minStockOverrideByPair(
  settings: readonly MinStockSettingRow[],
): Map<string, number | null> {
  const byPair = new Map<string, number | null>()
  for (const setting of settings) {
    byPair.set(`${setting.itemId}:${setting.warehouseId}`, setting.minStock)
  }
  return byPair
}

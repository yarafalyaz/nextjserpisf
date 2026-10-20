/**
 * Nilai persediaan dari lapisan FIFO — satu tempat untuk aturan penilaiannya.
 *
 * Aturannya ada dua, dan keduanya mudah tergelincir bila ditulis ulang:
 *
 * 1. **Metode penilaian ditentukan per barang**, dengan kategori menang atas
 *    barang (`category.costingMethod || item.costingMethod || "fifo"`).
 * 2. **Barang bermetode `average` dinilai dari `item.cost`**, bukan dari
 *    `layer.unitCost` — memakai harga lapisan pada barang average akan
 *    menghasilkan nilai yang berbeda dari HPP yang benar-benar dibukukan.
 *
 * Laporan Valuasi Stok dan laporan pemeriksaan **Selisih Saldo Akun Persediaan
 * dengan Nilai Barang** sama-sama memakai berkas ini: kalau salah satunya
 * menghitung sendiri, dua laporan itu bisa menampilkan dua nilai persediaan yang
 * berbeda untuk periode yang sama — selisih yang justru ingin dilaporkan.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { safeAdd, safeMultiply } from "@/lib/utils/math"

export interface StockValuationLayerInput {
  itemId: number
  warehouseId: number | null
  /** Sisa kuantitas lapisan. Lapisan bersisa 0 sudah disaring pemanggil. */
  remaining: number
  /** Harga per satuan lapisan (dipakai metode fifo). */
  unitCost: number
  item: {
    sku: string
    name: string
    unitOfMeasure: string | null
    /** Harga pokok terkini barang (dipakai metode average). */
    cost: number
    costingMethod: string | null
    category: { name: string | null; costingMethod: string | null } | null
  }
}

export interface StockValuationRow {
  sku: string
  name: string
  uom: string | null
  category: string
  warehouse: string
  warehouseCode: string
  qty: number
  value: number
  costingMethod: string
}

export interface StockValuationResult {
  rows: StockValuationRow[]
  totals: { qty: number; value: number }
  byWarehouse: { code: string; name: string; items: number; qty: number; value: number }[]
}

/**
 * Metode penilaian efektif sebuah barang: kategori menang atas barang, lalu
 * bawaan global perusahaan, lalu `fifo`.
 *
 * WAJIB selaras dengan `resolveCostingMethod` di `costing-method.service.ts`
 * (jalur terima/jual HPP): kategori → barang → global → fifo, dan nilai tak
 * dikenal/kosong dianggap belum diset. Dulu fungsi ini berhenti di barang dan
 * meneruskan nilai mentah (mis. "lifo" tetap "lifo" → dinilai FIFO diam-diam),
 * sehingga laporan valuasi bisa berbeda metode dari HPP yang dibukukan.
 * `globalMethod` opsional agar pemanggil lama tanpa konteks pengaturan tetap
 * berperilaku sama (jatuh ke fifo).
 */
export function resolveCostingMethod(
  item: {
    costingMethod: string | null
    category: { costingMethod: string | null } | null
  },
  globalMethod?: string | null,
): string {
  const normalize = (value: string | null | undefined): string | null => {
    if (!value) return null
    const v = value.toLowerCase()
    return v === "average" || v === "fifo" ? v : null
  }
  return (
    normalize(item.category?.costingMethod) ??
    normalize(item.costingMethod) ??
    normalize(globalMethod) ??
    "fifo"
  )
}

/** Nilai satu lapisan menurut metode barangnya. */
export function layerValue(
  layer: { remaining: number; unitCost: number; item: { cost: number } },
  method: string,
): number {
  return method === "average" ? safeMultiply(layer.remaining, layer.item.cost, 2) : safeMultiply(layer.remaining, layer.unitCost, 2)
}

export function buildStockValuation(
  layers: StockValuationLayerInput[],
  warehouseLookup: (warehouseId: number | null) => { name: string; code: string } | undefined,
  globalMethod?: string | null,
): StockValuationResult {
  const aggregated = new Map<string, StockValuationRow>()

  for (const layer of layers) {
    const key = `${layer.itemId}-${layer.warehouseId || 0}`
    const method = resolveCostingMethod(layer.item, globalMethod)
    const warehouse = warehouseLookup(layer.warehouseId)

    const existing = aggregated.get(key) ?? {
      sku: layer.item.sku,
      name: layer.item.name,
      // Satuan dibiarkan apa adanya (bisa kosong) supaya keluaran halaman
      // Valuasi Stok tidak berubah oleh pemindahan ini; kategori & gudang
      // memakai tanda "-" seperti sebelumnya.
      uom: layer.item.unitOfMeasure,
      category: layer.item.category?.name || "-",
      warehouse: warehouse?.name || "-",
      warehouseCode: warehouse?.code || "-",
      qty: 0,
      value: 0,
      costingMethod: method.toUpperCase(),
    }

    existing.qty += layer.remaining
    existing.value = safeAdd(existing.value, layerValue(layer, method), 2)
    aggregated.set(key, existing)
  }

  const rows = [...aggregated.values()].sort(
    (a, b) => a.warehouseCode.localeCompare(b.warehouseCode) || a.sku.localeCompare(b.sku),
  )

  const warehouseMap = new Map<string, { code: string; name: string; items: number; qty: number; value: number }>()
  for (const row of rows) {
    const existing = warehouseMap.get(row.warehouseCode) ?? {
      code: row.warehouseCode,
      name: row.warehouse,
      items: 0,
      qty: 0,
      value: 0,
    }
    existing.items += 1
    existing.qty += row.qty
    existing.value = safeAdd(existing.value, row.value, 2)
    warehouseMap.set(row.warehouseCode, existing)
  }

  return {
    rows,
    totals: {
      qty: rows.reduce((sum, row) => sum + row.qty, 0),
      value: rows.reduce((sum, row) => safeAdd(sum, row.value, 2), 0),
    },
    byWarehouse: [...warehouseMap.values()].sort((a, b) => a.code.localeCompare(b.code)),
  }
}

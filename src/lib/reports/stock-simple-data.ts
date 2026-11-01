/**
 * Pemuatan data laporan stok (umur, ringkasan, rekonsiliasi) — satu sumber layar & PDF.
 *
 * - Umur stok: lapisan FIFO bersisa, umur = hari sejak lapisan lahir menurut
 *   umur asal (COALESCE(sourceCreatedAt, createdAt), STOK-08/09 — sama
 *   dengan urutan FIFO, supaya stok pindahan tidak terlihat lebih muda).
 * - Ringkasan stok: agregasi lapisan per gudang + per kategori (basis FIFO yang
 *   sama dengan Valuasi Stok — jangan memakai `qtyOnHand` untuk nilai).
 * - Rekonsiliasi stok: bandingkan master `qtyOnHand` vs total lapisan FIFO.
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import { reconcileInventory } from "@/lib/inventory/stock-reconciliation"
import { formatAccounting, formatQuantity } from "@/lib/utils/format"
import { safeAdd, safeMultiply } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface StockSimpleReport {
  table: { columns: TableColumn[]; rows: TableRow[] }
  periodLabel: string
  periodCaption: string
}

export interface StockReconciliationReport extends StockSimpleReport {
  summary: ReturnType<typeof reconcileInventory>
}

/** Agregasi lapisan FIFO per gudang, nilai persis sen per lapisan. */
export function aggregateLayersByWarehouse(
  layers: { itemId: number; warehouseId: number | null; remaining: unknown; unitCost: unknown }[],
): Map<number, { qty: number; value: number; items: Set<number> }> {
  const byWarehouse = new Map<number, { qty: number; value: number; items: Set<number> }>()
  for (const layer of layers) {
    const id = layer.warehouseId ?? 0
    const agg = byWarehouse.get(id) ?? { qty: 0, value: 0, items: new Set<number>() }
    const remaining = Number(layer.remaining)
    agg.qty = safeAdd(agg.qty, remaining, 2)
    agg.value = safeAdd(agg.value, safeMultiply(remaining, Number(layer.unitCost), 2), 2)
    agg.items.add(layer.itemId)
    byWarehouse.set(id, agg)
  }
  return byWarehouse
}

/** Total lapisan FIFO per barang, nilai persis sen per lapisan. */
export function aggregateLayersByItem(
  layers: { itemId: number; remaining: unknown; unitCost: unknown }[],
): Map<number, { layerQty: number; layerValue: number }> {
  const layerTotals = new Map<number, { layerQty: number; layerValue: number }>()
  for (const layer of layers) {
    const agg = layerTotals.get(layer.itemId) ?? { layerQty: 0, layerValue: 0 }
    const remaining = Number(layer.remaining)
    agg.layerQty = safeAdd(agg.layerQty, remaining, 2)
    agg.layerValue = safeAdd(agg.layerValue, safeMultiply(remaining, Number(layer.unitCost), 2), 2)
    layerTotals.set(layer.itemId, agg)
  }
  return layerTotals
}

/** Total kuantitas persis 2 desimal (skala Decimal(15,2)). */
export function sumRemainingQty(layers: { remaining: unknown }[]): number {
  return layers.reduce((sum, layer) => safeAdd(sum, Number(layer.remaining), 2), 0)
}

const money = (value: number) => formatAccounting(value, { zeroDash: false })
const qty = (value: number) => formatQuantity(value)
const nowLabels = () => {
  const now = new Date()
  return rangePeriodLabels({ start: now, end: now })
}

function ageGroup(days: number): string {
  if (days <= 30) return "0–30 Hari"
  if (days <= 60) return "31–60 Hari"
  if (days <= 90) return "61–90 Hari"
  return "> 90 Hari"
}

const AGING_COLUMNS: TableColumn[] = [
  { header: "SKU", align: "left", width: 36 },
  { header: "Nama Item", align: "left", width: 70 },
  { header: "Kategori", align: "left", width: 36 },
  { header: "Satuan", align: "left", width: 18 },
  { header: "Kuantitas", align: "right", width: 24 },
  { header: "Umur (Hari)", align: "right", width: 22 },
  { header: "Kelompok", align: "left", width: 26 },
]

export async function loadStockAging(
  // ROUND5-SCOPE: undefined = tanpa penegakan; array (termasuk kosong) ditegakkan.
  scopeWarehouseIds?: number[] | null,
): Promise<StockSimpleReport> {
  const layers = await prisma.inventoryLayer.findMany({
    where: {
      remaining: { gt: 0 },
      ...(scopeWarehouseIds != null ? { warehouseId: { in: scopeWarehouseIds } } : {}),
    },
    include: {
      item: { select: { sku: true, name: true, unitOfMeasure: true, category: { select: { name: true } } } },
    },
  })
  const now = new Date()
  const rows: TableRow[] = layers
    .map((layer) => {
      // STOK-08/09: umur kanonis = umur asal lapisan (transfer membawa
      // sourceCreatedAt lapisan sumber), bukan tanggal layer tujuan lahir.
      const ageDays = Math.ceil((now.getTime() - new Date(layer.sourceCreatedAt ?? layer.createdAt).getTime()) / 86_400_000)
      return {
        sku: layer.item.sku,
        name: layer.item.name,
        category: layer.item.category?.name ?? "-",
        uom: layer.item.unitOfMeasure ?? "-",
        qty: Number(layer.remaining),
        ageDays,
        group: ageGroup(ageDays),
      }
    })
    .sort((a, b) => b.ageDays - a.ageDays)
    .map((r) => ({
      kind: "data" as const,
      cells: [r.sku, r.name, r.category, r.uom, qty(r.qty), String(r.ageDays), r.group],
    }))
  if (rows.length === 0) rows.push({ kind: "notice", text: "Tidak ada stok." })
  else {
    const total = sumRemainingQty(layers)
    // Kuantitas bukan kolom trailing (Umur/Kelompok setelahnya) — baris data
    // bold supaya angka tetap di kolom Kuantitas, bukan geser ke Kelompok.
    rows.push({ kind: "data", bold: true, cells: ["", "Jumlah", "", "", qty(total), "", ""] })
  }
  return { table: { columns: AGING_COLUMNS, rows }, ...nowLabels() }
}

const SUMMARY_COLUMNS: TableColumn[] = [
  { header: "Gudang", align: "left", width: 60 },
  { header: "Jenis Item", align: "right", width: 26 },
  { header: "Total Qty", align: "right", width: 30 },
  { header: "Total Nilai", align: "right", width: 44 },
]

export async function loadStockSummary(
  // R6PA-04/R6IE-08: undefined = tanpa penegakan; array (termasuk kosong) ditegakkan.
  scopeWarehouseIds?: number[] | null,
): Promise<StockSimpleReport> {
  const scoped = scopeWarehouseIds != null
  const [warehouses, layers] = await Promise.all([
    prisma.warehouse.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        ...(scoped ? { id: { in: scopeWarehouseIds } } : {}),
      },
      orderBy: { code: "asc" },
    }),
    prisma.inventoryLayer.findMany({
      where: {
        remaining: { gt: 0 },
        ...(scoped ? { warehouseId: { in: scopeWarehouseIds } } : {}),
      },
      select: { itemId: true, warehouseId: true, remaining: true, unitCost: true },
    }),
  ])
  const byWarehouse = aggregateLayersByWarehouse(layers)
  const rows: TableRow[] = []
  let totalQty = 0
  let totalValue = 0
  for (const wh of warehouses) {
    const agg = byWarehouse.get(wh.id)
    if (!agg) continue
    totalQty = safeAdd(totalQty, agg.qty, 2)
    totalValue = safeAdd(totalValue, agg.value, 2)
    rows.push({
      kind: "data",
      cells: [`${wh.code} - ${wh.name}`, String(agg.items.size), qty(agg.qty), money(agg.value)],
    })
  }
  if (!scoped) {
    // R6IE-08: layer yatim (warehouseId null/gudang nonaktif/terhapus) tetap
    // masuk total saat laporan global. Saat scope ditegakkan layer itu sudah
    // tersaring di query dan tidak boleh bocor melalui baris ini.
    const listedIds = new Set(warehouses.map((wh) => wh.id))
    let orphanQty = 0
    let orphanValue = 0
    const orphanItems = new Set<number>()
    for (const [warehouseId, agg] of byWarehouse) {
      if (listedIds.has(warehouseId)) continue
      orphanQty = safeAdd(orphanQty, agg.qty, 2)
      orphanValue = safeAdd(orphanValue, agg.value, 2)
      for (const itemId of agg.items) orphanItems.add(itemId)
    }
    if (orphanQty > 0 || orphanValue > 0) {
      totalQty = safeAdd(totalQty, orphanQty, 2)
      totalValue = safeAdd(totalValue, orphanValue, 2)
      rows.push({
        kind: "data",
        cells: ["Tanpa Gudang / Lainnya", String(orphanItems.size), qty(orphanQty), money(orphanValue)],
      })
    }
  }
  if (rows.length === 0) rows.push({ kind: "notice", text: "Tidak ada stok." })
  else rows.push({ kind: "total", grand: true, label: "Jumlah", cells: [qty(totalQty), money(totalValue)] })
  return { table: { columns: SUMMARY_COLUMNS, rows }, ...nowLabels() }
}

const RECON_COLUMNS: TableColumn[] = [
  { header: "SKU", align: "left", width: 36 },
  { header: "Nama Item", align: "left", width: 70 },
  { header: "Kuantitas Induk", align: "right", width: 30 },
  { header: "Kuantitas FIFO", align: "right", width: 30 },
  { header: "Selisih", align: "right", width: 26 },
  { header: "Nilai FIFO", align: "right", width: 40 },
]

export async function loadStockReconciliation(
  // Item.qtyOnHand adalah total global semua gudang, jadi scope hanya
  // membatasi item yang tampil (punya layer tersisa di gudang cakupan).
  // Selisih tetap master global vs FIFO global agar tidak menjadi klaim
  // integritas palsu untuk item multi-gudang.
  scopeWarehouseIds?: number[] | null,
): Promise<StockReconciliationReport> {
  const scoped = scopeWarehouseIds != null
  const [items, layers] = await Promise.all([
    prisma.item.findMany({
      where: { deletedAt: null },
      select: { id: true, sku: true, name: true, qtyOnHand: true },
      orderBy: { name: "asc" },
    }),
    prisma.inventoryLayer.findMany({
      where: { remaining: { gt: 0 } },
      select: { itemId: true, warehouseId: true, remaining: true, unitCost: true },
    }),
  ])

  const visibleItemIds = scoped
    ? new Set(
        layers
          .filter((layer) => layer.warehouseId != null && scopeWarehouseIds.includes(layer.warehouseId))
          .map((layer) => layer.itemId),
      )
    : null

  // Item terhapus dengan layer tersisa tetap direkonsiliasi pada laporan
  // global/scoped yang mencakup gudangnya; layer yatim tidak membuka
  // visibilitas untuk user scoped.
  const itemById = new Map(items.map((item) => [item.id, item]))
  const orphanLayerItemIds = [...new Set(layers.map((layer) => layer.itemId))].filter(
    (id) => !itemById.has(id) && (!visibleItemIds || visibleItemIds.has(id)),
  )
  const orphanItems = orphanLayerItemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: orphanLayerItemIds } },
        select: { id: true, sku: true, name: true, qtyOnHand: true },
      })
    : []

  const candidateItems = [...items, ...orphanItems].filter(
    (item) => !visibleItemIds || visibleItemIds.has(item.id),
  )
  const layerTotals = aggregateLayersByItem(layers)
  const summary = reconcileInventory(
    candidateItems.map((i) => ({ itemId: i.id, sku: i.sku, name: i.name, masterQty: Number(i.qtyOnHand) })),
    layerTotals,
  )
  const rows: TableRow[] = summary.mismatches.map((row) => ({
    kind: "data" as const,
    cells: [
      row.sku,
      row.name,
      qty(row.masterQty),
      qty(row.layerQty),
      `${row.variance > 0 ? "+" : ""}${qty(row.variance)}`,
      money(row.layerValue),
    ],
  }))
  if (rows.length === 0) {
    rows.push({
      kind: "notice",
      text: scoped
        ? "Tidak ada selisih pada item yang tampil dalam cakupan gudang."
        : "Semua item seimbang — jumlah induk sama dengan total lapisan FIFO.",
    })
  }
  if (scoped) {
    rows.unshift({
      kind: "notice",
      text:
        "Cakupan gudang: item hanya tampil bila punya lapisan FIFO di gudang Anda. " +
        "Kuantitas Induk, Kuantitas FIFO, Selisih, dan Nilai FIFO adalah total global semua gudang.",
    })
  }
  return { table: { columns: RECON_COLUMNS, rows }, summary, ...nowLabels() }
}

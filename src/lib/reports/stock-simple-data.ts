/**
 * Pemuatan data laporan stok (umur, ringkasan, rekonsiliasi) — satu sumber layar & PDF.
 *
 * - Umur stok: lapisan FIFO bersisa, umur = hari sejak lapisan dibuat.
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

export async function loadStockAging(): Promise<StockSimpleReport> {
  const layers = await prisma.inventoryLayer.findMany({
    where: { remaining: { gt: 0 } },
    include: {
      item: { select: { sku: true, name: true, unitOfMeasure: true, category: { select: { name: true } } } },
    },
  })
  const now = new Date()
  const rows: TableRow[] = layers
    .map((layer) => {
      const ageDays = Math.ceil((now.getTime() - new Date(layer.createdAt).getTime()) / 86_400_000)
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

export async function loadStockSummary(): Promise<StockSimpleReport> {
  const [warehouses, layers] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { code: "asc" } }),
    prisma.inventoryLayer.findMany({
      where: { remaining: { gt: 0 } },
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

export async function loadStockReconciliation(): Promise<StockSimpleReport> {
  const [items, layers] = await Promise.all([
    prisma.item.findMany({
      where: { deletedAt: null },
      select: { id: true, sku: true, name: true, qtyOnHand: true },
      orderBy: { name: "asc" },
    }),
    prisma.inventoryLayer.findMany({
      where: { remaining: { gt: 0 } },
      select: { itemId: true, remaining: true, unitCost: true },
    }),
  ])
  const layerTotals = aggregateLayersByItem(layers)
  const summary = reconcileInventory(
    items.map((i) => ({ itemId: i.id, sku: i.sku, name: i.name, masterQty: Number(i.qtyOnHand) })),
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
    rows.push({ kind: "notice", text: "Semua item seimbang — jumlah induk sama dengan total lapisan FIFO." })
  }
  return { table: { columns: RECON_COLUMNS, rows }, ...nowLabels() }
}

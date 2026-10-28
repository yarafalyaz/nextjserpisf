/**
 * Pemuatan data laporan persediaan & penjualan (mutasi, valuasi, kartu,
 * analisis penjualan) — satu sumber layar & PDF.
 *
 * - Mutasi stok: `stockMove` posted pada periode (+ filter gudang opsional).
 * - Valuasi stok: lapisan FIFO bersisa, aturan `buildStockValuation` (kategori
 *   menang; average memakai harga pokok barang).
 * - Kartu stok: butuh barang — tanpa barang PDF mengembalikan tabel kosong
 *   yang menjelaskan cara memilih, bukan error.
 * - Analisis penjualan: agregasi `aggregateSales` per dimensi.
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import { buildStockValuation, toValuationLayers } from "@/lib/reports/stock-valuation"
import { buildStockCard, openingBalance } from "@/lib/reports/stock-card"
import {
  aggregateSales,
  type SalesDimension,
  type SalesLine,
} from "@/lib/reports/sales-analytics"
import { RECOGNISED_AR_STATUSES } from "@/lib/reports/document-status"
import { formatAccounting, formatReferenceType, formatQuantity, formatDate } from "@/lib/utils/format"
import { getSystemSettings } from "@/lib/utils/settings"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface StockFlowReport {
  table: { columns: TableColumn[]; rows: TableRow[] }
  periodLabel: string
  periodCaption: string
}

const money = (value: number) => formatAccounting(value, { zeroDash: false })
const qty = (value: number) => formatQuantity(value)
const shortDate = (date: Date) =>
  formatDate(date, { format: "short" })
const periodOf = (period: { start: Date; end: Date }) => rangePeriodLabels(period)

type Period = { start: Date; end: Date }

const MOVEMENT_COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 26 },
  { header: "Dokumen", align: "left", width: 34 },
  { header: "SKU", align: "left", width: 30 },
  { header: "Nama Item", align: "left", width: 54 },
  { header: "Gudang", align: "left", width: 22 },
  { header: "Jenis", align: "left", width: 30 },
  { header: "Qty", align: "right", width: 26 },
  { header: "Referensi", align: "left", width: 34 },
]

export async function loadStockMovements(
  period: Period,
  warehouseId: number | null,
): Promise<StockFlowReport> {
  const moves = await prisma.stockMove.findMany({
    where: {
      status: "posted",
      date: { gte: period.start, lte: period.end },
      ...(warehouseId ? { warehouseId } : {}),
    },
    include: {
      item: { select: { sku: true, name: true } },
      warehouse: { select: { code: true } },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  })
  const rows: TableRow[] = moves
    .filter((m) => m.date)
    .map((m) => ({
      kind: "data" as const,
      cells: [
        shortDate(m.date!),
        m.documentNo,
        m.item.sku,
        m.item.name,
        m.warehouse?.code ?? "-",
        m.moveType ?? "-",
        `${m.impact === "IN" ? "+" : "-"}${qty(Number(m.qty))}`,
        m.referenceType ? `${formatReferenceType(m.referenceType)}#${m.referenceId}` : "-",
      ],
    }))
  if (rows.length === 0) rows.push({ kind: "notice", text: "Tidak ada mutasi stok pada periode ini." })
  return { table: { columns: MOVEMENT_COLUMNS, rows }, ...periodOf(period) }
}

const VALUATION_COLUMNS: TableColumn[] = [
  { header: "SKU", align: "left", width: 34 },
  { header: "Nama Item", align: "left", width: 62 },
  { header: "Kategori", align: "left", width: 32 },
  { header: "Gudang", align: "left", width: 28 },
  { header: "Satuan", align: "left", width: 16 },
  { header: "Metode", align: "left", width: 18 },
  { header: "Jml", align: "right", width: 24 },
  { header: "Total Nilai", align: "right", width: 40 },
]

export async function loadStockValuation(warehouseId: number | null): Promise<StockFlowReport> {
  const settings = await getSystemSettings()
  const [warehouses, layers] = await Promise.all([
    prisma.warehouse.findMany({ where: { isActive: true, deletedAt: null }, orderBy: { code: "asc" } }),
    prisma.inventoryLayer.findMany({
      where: { remaining: { gt: 0 }, ...(warehouseId ? { warehouseId } : {}) },
      include: {
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
    }),
  ])
  const warehouseMap = new Map(warehouses.map((w) => [w.id, { name: w.name, code: w.code }]))
  const { rows: valueRows, totals } = buildStockValuation(
    toValuationLayers(layers),
    (id) => warehouseMap.get(id ?? 0),
    settings.costingMethod,
  )
  const rows: TableRow[] = valueRows.map((row) => ({
    kind: "data" as const,
    cells: [
      row.sku,
      row.name,
      row.category,
      row.warehouse,
      row.uom ?? "-",
      row.costingMethod,
      qty(row.qty),
      money(row.value),
    ],
  }))
  if (rows.length === 0) rows.push({ kind: "notice", text: "Tidak ada stok." })
  else rows.push({ kind: "total", grand: true, label: "Jumlah", cells: ["", "", "", "", "", "", qty(totals.qty), money(totals.value)] })
  const now = new Date()
  return { table: { columns: VALUATION_COLUMNS, rows }, ...rangePeriodLabels({ start: now, end: now }) }
}

const CARD_COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 26 },
  { header: "Dokumen", align: "left", width: 34 },
  { header: "Jenis", align: "left", width: 30 },
  { header: "Masuk", align: "right", width: 26 },
  { header: "Keluar", align: "right", width: 26 },
  { header: "Saldo", align: "right", width: 26 },
  { header: "Keterangan", align: "left", width: 60 },
]

export async function loadStockCard(
  period: Period,
  itemId: number | null,
  warehouseId: number | null,
): Promise<StockFlowReport> {
  if (!itemId) {
    return {
      table: {
        columns: CARD_COLUMNS,
        rows: [{ kind: "notice", text: "Pilih barang terlebih dahulu (parameter barang=<slug/id>) untuk menampilkan kartu stok." }],
      },
      ...periodOf(period),
    }
  }
  const baseWhere = { itemId, status: "posted" as const, ...(warehouseId ? { warehouseId } : {}) }
  const [priorMoves, periodMoves] = await Promise.all([
    prisma.stockMove.findMany({
      where: { ...baseWhere, date: { lt: period.start } },
      select: { qty: true, cost: true, impact: true },
    }),
    prisma.stockMove.findMany({
      where: { ...baseWhere, date: { gte: period.start, lte: period.end } },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),
  ])
  const card = buildStockCard(
    periodMoves.map((m) => ({
      id: m.id,
      date: m.date ?? m.createdAt,
      documentNo: m.documentNo,
      moveType: m.moveType ?? "-",
      impact: m.impact === "IN" || m.impact === "OUT" ? m.impact : "IN",
      qty: Number(m.qty),
      cost: Number(m.cost),
      referenceType: m.referenceType,
      referenceId: m.referenceId,
      description: m.description,
      warehouseCode: null,
    })),
    openingBalance(priorMoves.map((m) => ({ qty: Number(m.qty), cost: Number(m.cost), impact: m.impact }))),
  )
  const rows: TableRow[] = [
    { kind: "data", cells: ["", "Saldo Awal", "", qty(card.openingQty), "", qty(card.closingQty - card.totalInQty + card.totalOutQty), ""] },
  ]
  for (const move of card.rows) {
    rows.push({
      kind: "data",
      cells: [
        shortDate(move.date),
        move.documentNo,
        move.moveType ?? "-",
        move.impact === "IN" ? qty(move.qty) : "",
        move.impact === "OUT" ? qty(move.qty) : "",
        qty(move.balanceQty),
        move.description ?? "-",
      ],
    })
  }
  rows.push({
    kind: "total",
    grand: true,
    label: "Saldo Akhir",
    cells: ["", "", "", qty(card.totalInQty), qty(card.totalOutQty), qty(card.closingQty), ""],
  })
  return { table: { columns: CARD_COLUMNS, rows }, ...periodOf(period) }
}

const SALES_COLUMNS: TableColumn[] = [
  { header: "Kelompok", align: "left", width: 100 },
  { header: "Kuantitas", align: "right", width: 30 },
  { header: "Nilai Penjualan", align: "right", width: 46 },
  { header: "Porsi", align: "right", width: 24 },
]

export async function loadSalesAnalytics(period: Period, dimension: SalesDimension): Promise<StockFlowReport> {
  const invoices = await prisma.salesInvoice.findMany({
    where: { status: { in: [...RECOGNISED_AR_STATUSES] }, deletedAt: null, date: { gte: period.start, lte: period.end } },
    select: {
      customer: { select: { id: true, name: true } },
      items: { select: { itemId: true, description: true, qty: true, total: true } },
    },
  })
  const itemIds = [...new Set(invoices.flatMap((inv) => inv.items.map((i) => i.itemId)).filter((id): id is number => id != null))]
  const items = itemIds.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIds } },
        select: { id: true, sku: true, name: true, brand: { select: { name: true } } },
      })
    : []
  const itemById = new Map(items.map((item) => [item.id, item]))
  const lines: SalesLine[] = invoices.flatMap((inv) =>
    inv.items.map((it) => {
      const item = it.itemId != null ? itemById.get(it.itemId) : undefined
      return {
        itemKey: it.itemId != null ? String(it.itemId) : null,
        itemLabel: item ? `${item.sku} — ${item.name}` : (it.description ?? "(tanpa barang)"),
        brandName: item?.brand?.name ?? null,
        customerId: inv.customer.id,
        customerName: inv.customer.name,
        qty: Number(it.qty),
        revenue: Number(it.total),
      }
    }),
  )
  const groups = aggregateSales(lines, dimension)
  const totalRevenue = groups.reduce((s, g) => s + g.revenue, 0)
  const rows: TableRow[] = groups.map((g) => ({
    kind: "data" as const,
    cells: [
      g.label,
      qty(g.qty),
      money(g.revenue),
      totalRevenue > 0 ? `${((g.revenue / totalRevenue) * 100).toFixed(1)}%` : "-",
    ],
  }))
  if (rows.length === 0) rows.push({ kind: "notice", text: "Belum ada data penjualan pada periode ini." })
  else rows.push({ kind: "total", grand: true, label: "Jumlah", cells: ["", "", money(totalRevenue), "100%"] })
  return { table: { columns: SALES_COLUMNS, rows }, ...periodOf(period) }
}

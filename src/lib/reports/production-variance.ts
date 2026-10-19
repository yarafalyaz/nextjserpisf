/**
 * Varians produksi per perintah produksi (standar vs aktual).
 *
 * Memecah `ProductionOrder.variance` — angka yang selama ini hanya diakumulasi
 * di order saat rilis hasil (lihat manufacturing.actions.ts) dan tidak pernah
 * dilaporkan — menjadi komponen yang bisa ditindaklanjuti:
 *
 * - Selisih harga bahan = (harga aktual/unit − harga standar/unit) × qty aktual.
 *   Harga/unit diturunkan dari baris itu sendiri (actualCost/actualQty dan
 *   standardCost×qty), bukan dari master item, supaya angka rekonsiliasi ke
 *   biaya yang benar-benar tercatat di baris.
 * - Selisih pemakaian bahan = (qty aktual − qty standar) × harga standar/unit.
 *   Dua komponen ini menjumlah persis ke (actualCost − standardCost×qty)
 *   per baris, jadi totalnya rekonsiliasi ke selisih bahan order.
 * - Selisih tenaga kerja & biaya lain = ProductionCost aktual. Tidak ada
 *   standar per kategori biaya di schema (standar hanya di bahan dan total
 *   order), jadi komponen ini dilaporkan apa adanya sebagai aktual, bukan
 *   dikarang standarnya.
 *
 * Baris dengan standar nol (bahan di luar BOM, atau BOM belum dikalibrasi)
 * ditandai `uncalibrated`: selisih harganya tidak bermakna dan barisnya tidak
 * boleh ikut jurnal disposisi apa pun — pemanggil wajib menghormati tanda ini.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 267mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Perintah Produksi", align: "left", width: 63 },
  { header: "Selisih Harga Bahan", align: "right", width: 40 },
  { header: "Selisih Pemakaian", align: "right", width: 40 },
  { header: "Tenaga Kerja & Lainnya", align: "right", width: 42 },
  { header: "Varians Order", align: "right", width: 40 },
  { header: "Varians %", align: "right", width: 42 },
]

export interface ProductionVarianceMaterialInput {
  itemId: number
  /** Qty standar dari BOM (0 untuk bahan di luar rencana). */
  qty: number
  /** Qty aktual terpakai (null = belum ada pemakaian tercatat). */
  actualQty: number | null
  /** Harga standar per unit bahan. */
  standardCost: number
  /** Total biaya aktual baris. */
  actualCost: number
}

export interface ProductionVarianceCostInput {
  category: string
  amount: number
}

export interface ProductionVarianceOrderInput {
  id: number
  documentNo: string
  date: Date
  status: string
  productName: string | null
  totalStandardCost: number
  totalActualCost: number
  releasedCost: number
  /** Kolom variance order — angka rekonsiliasi yang wajib dicocokkan. */
  recordedVariance: number
  materials: ProductionVarianceMaterialInput[]
  costs: ProductionVarianceCostInput[]
}

export interface ProductionVarianceMaterialLine {
  itemId: number
  priceVariance: number
  usageVariance: number
  totalVariance: number
  uncalibrated: boolean
}

export interface ProductionVarianceOrderLine {
  id: number
  documentNo: string
  materialPriceVariance: number
  materialUsageVariance: number
  laborAndOtherCost: number
  /** Varians hasil hitung ulang dari komponen (standar vs aktual). */
  computedVariance: number
  recordedVariance: number
  /** Selisih hitung ulang vs kolom order — harus 0 (dibulatkan) bila data konsisten. */
  varianceDrift: number
  variancePct: number | null
  uncalibratedLines: number
}

export interface ProductionVarianceTotals {
  materialPriceVariance: number
  materialUsageVariance: number
  laborAndOtherCost: number
  materialTotalVariance: number
  computedVariance: number
  recordedVariance: number
  varianceDrift: number
}

export interface ProductionVarianceResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  orders: ProductionVarianceOrderLine[]
  materialLines: Map<number, ProductionVarianceMaterialLine[]>
  totals: ProductionVarianceTotals
  orderCount: number
  /** Order yang memuat minimal satu baris bahan tanpa standar terkalibrasi. */
  uncalibratedOrders: number
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function percent(value: number | null): string {
  if (value === null) return "–"
  return `${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(value)}%`
}

/** Pecah satu baris bahan menjadi selisih harga + selisih pemakaian. */
export function splitMaterialVariance(
  material: ProductionVarianceMaterialInput,
): ProductionVarianceMaterialLine {
  const actualQty = material.actualQty ?? 0
  const standardTotal = round2(material.standardCost * material.qty)
  const totalVariance = round2(material.actualCost - standardTotal)
  const uncalibrated = material.standardCost <= 0

  if (uncalibrated || actualQty <= 0) {
    // Tanpa harga standar (atau tanpa pemakaian) pemecahan harga/pemakaian
    // tidak terdefinisi — seluruh selisih dibebankan ke pemakaian supaya
    // total baris tetap rekonsiliasi, dan baris ditandai tidak terkalibrasi
    // bila memang standarnya yang hilang.
    return {
      itemId: material.itemId,
      priceVariance: 0,
      usageVariance: totalVariance,
      totalVariance,
      uncalibrated,
    }
  }

  const actualUnit = material.actualCost / actualQty
  const priceVariance = round2((actualUnit - material.standardCost) * actualQty)
  return {
    itemId: material.itemId,
    priceVariance,
    // Sisa dari total — bukan hitungan terpisah — supaya dua komponen selalu
    // menjumlah persis ke selisih baris walau ada pembulatan harga satuan.
    usageVariance: round2(totalVariance - priceVariance),
    totalVariance,
    uncalibrated: false,
  }
}

export function buildProductionVariance(input: {
  orders: ProductionVarianceOrderInput[]
  start: Date
  end: Date
}): ProductionVarianceResult {
  const { orders, start, end } = input
  const inPeriod = (date: Date) => date.getTime() >= start.getTime() && date.getTime() <= end.getTime()

  const visible = orders
    .filter((order) => inPeriod(order.date))
    .sort((a, b) => {
      const byDate = a.date.getTime() - b.date.getTime()
      return byDate !== 0 ? byDate : a.documentNo.localeCompare(b.documentNo, "id-ID")
    })

  const lines: ProductionVarianceOrderLine[] = []
  const materialLines = new Map<number, ProductionVarianceMaterialLine[]>()
  const totals: ProductionVarianceTotals = {
    materialPriceVariance: 0,
    materialUsageVariance: 0,
    laborAndOtherCost: 0,
    materialTotalVariance: 0,
    computedVariance: 0,
    recordedVariance: 0,
    varianceDrift: 0,
  }
  let uncalibratedOrders = 0

  for (const order of visible) {
    const split = order.materials.map(splitMaterialVariance)
    materialLines.set(order.id, split)

    const materialPriceVariance = round2(split.reduce((sum, line) => sum + line.priceVariance, 0))
    const materialUsageVariance = round2(split.reduce((sum, line) => sum + line.usageVariance, 0))
    const laborAndOtherCost = round2(order.costs.reduce((sum, cost) => sum + cost.amount, 0))
    const uncalibratedLines = split.filter((line) => line.uncalibrated).length
    if (uncalibratedLines > 0) uncalibratedOrders += 1

    // Biaya aktual order: setelah rilis final totalActualCost di-nol-kan dan
    // akumulasinya pindah ke releasedCost, jadi aktual penuh = sisa WIP +
    // yang sudah dirilis.
    const actualTotal = round2(order.totalActualCost + order.releasedCost)
    const computedVariance = round2(actualTotal - order.totalStandardCost)
    const recordedVariance = round2(order.recordedVariance)
    const varianceDrift = round2(computedVariance - recordedVariance)

    lines.push({
      id: order.id,
      documentNo: order.documentNo,
      materialPriceVariance,
      materialUsageVariance,
      laborAndOtherCost,
      computedVariance,
      recordedVariance,
      varianceDrift,
      variancePct:
        order.totalStandardCost > 0 ? round2((computedVariance / order.totalStandardCost) * 100) : null,
      uncalibratedLines,
    })

    totals.materialPriceVariance = round2(totals.materialPriceVariance + materialPriceVariance)
    totals.materialUsageVariance = round2(totals.materialUsageVariance + materialUsageVariance)
    totals.laborAndOtherCost = round2(totals.laborAndOtherCost + laborAndOtherCost)
    totals.materialTotalVariance = round2(
      totals.materialTotalVariance + materialPriceVariance + materialUsageVariance,
    )
    totals.computedVariance = round2(totals.computedVariance + computedVariance)
    totals.recordedVariance = round2(totals.recordedVariance + recordedVariance)
    totals.varianceDrift = round2(totals.varianceDrift + varianceDrift)
  }

  const rows: TableRow[] = lines.map((line, index) => ({
    kind: "data",
    cells: [
      `${visible[index].documentNo}${visible[index].productName ? ` · ${visible[index].productName}` : ""}`,
      amount(line.materialPriceVariance),
      amount(line.materialUsageVariance),
      amount(line.laborAndOtherCost),
      amount(line.computedVariance),
      percent(line.variancePct),
    ],
  }))

  if (lines.length === 0) {
    rows.push({
      kind: "notice",
      text: "Tidak ada perintah produksi pada periode ini. Ubah periode, atau buat perintah produksi di Produksi → Perintah Produksi.",
    })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [
        "",
        amount(totals.materialPriceVariance),
        amount(totals.materialUsageVariance),
        amount(totals.laborAndOtherCost),
        amount(totals.computedVariance),
        "–",
      ],
    })
  }

  if (uncalibratedOrders > 0) {
    rows.push({
      kind: "notice",
      text:
        `${uncalibratedOrders} perintah produksi memuat bahan tanpa standar terkalibrasi (standar nol) — ` +
        `selisihnya ditampilkan sebagai pemakaian dan tidak boleh dijurnalkan sebagai disposisi varians.`,
    })
  }
  if (totals.varianceDrift !== 0) {
    rows.push({
      kind: "notice",
      text:
        `Selisih rekonsiliasi ${amount(totals.varianceDrift)} antara varians hitung ulang dan kolom varians order — ` +
        `periksa order yang rilis parsialnya belum final.`,
    })
  }

  return {
    table: { columns: COLUMNS, rows },
    orders: lines,
    materialLines,
    totals,
    orderCount: lines.length,
    uncalibratedOrders,
  }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function productionVarianceSummary(result: ProductionVarianceResult): string {
  return (
    `${result.orderCount} perintah produksi: selisih harga bahan ${formatCurrency(result.totals.materialPriceVariance)} · ` +
    `selisih pemakaian ${formatCurrency(result.totals.materialUsageVariance)} · tenaga kerja & lainnya ` +
    `${formatCurrency(result.totals.laborAndOtherCost)} · total varians ${formatCurrency(result.totals.computedVariance)}`
  )
}

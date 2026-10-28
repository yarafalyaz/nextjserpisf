/**
 * Bahan & biaya per pekerjaan pesanan (job order costing).
 *
 * Menjawab pertanyaan yang paling sering muncul di bengkel/produksi pesanan:
 * "pekerjaan ini sudah menghabiskan berapa, dan hasilnya berapa per unit?"
 * Biayanya dijumlahkan dari dua tempat yang memang terpisah di database —
 * bahan dari `MaterialIssue` (dikelompokkan sebagai pekerjaan) dan biaya
 * non-bahan dari `ProductionCost` (tenaga kerja, mesin, overhead, subkontrak).
 *
 * Yang TIDAK dilakukan di sini: memakai `WorkOrderItem.cost` sebagai "harga
 * jual". Itu nilai penawaran, bukan biaya; mencampurnya membuat laporan biaya
 * tampak menguntungkan padahal hanya membandingkan dua harga jual.
 *
 * Barisnya dikelompokkan per bulan (Accurate: "Bahan dan Biaya Pekerjaan per
 * Bulan") supaya pekerjaan yang menyeberang bulan tetap terbaca per periode.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency, formatMonthYear, formatQuantity } from "@/lib/utils/format"
import { safeAdd } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 267mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Pekerjaan", align: "left", width: 87 },
  { header: "Bahan", align: "right", width: 36 },
  { header: "Biaya Produksi", align: "right", width: 36 },
  { header: "Total Biaya", align: "right", width: 36 },
  { header: "Selesai", align: "right", width: 30 },
  { header: "Biaya / Unit", align: "right", width: 42 },
]

/** Biaya per unit tidak bisa dihitung bila belum ada hasil. */
const NO_UNIT_COST = "–"

export interface JobOrderCostInput {
  id: number
  documentNo: string
  date: Date
  customerName: string | null
  status: string
  /** Nilai bahan terpakai (`MaterialIssue` selesai) untuk pekerjaan ini. */
  materialCost: number
  /** Biaya produksi non-bahan untuk pekerjaan ini. */
  productionCost: number
  /** Jumlah unit yang sudah selesai (`ProductionOrder.completedQty`). */
  completedQty: number
}

export interface JobOrderCostTotals {
  materialCost: number
  productionCost: number
  totalCost: number
  completedQty: number
  unitCost: number
}

export interface JobOrderCostResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  totals: JobOrderCostTotals
  jobCount: number
  /** Pekerjaan yang sudah berbaya tetapi belum menghasilkan unit. */
  withoutOutput: number
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function monthLabel(date: Date): string {
  return formatMonthYear(date)
}

function quantity(value: number): string {
  return formatQuantity(value)
}

/**
 * Susun laporan bahan & biaya per pekerjaan. Pekerjaan tanpa biaya sama sekali
 * tetap ditampilkan (biaya nol itu informasi: pekerjaan belum jalan), tetapi
 * pekerjaan di luar periode tidak ikut.
 */
export function buildJobOrderCost(input: {
  jobs: JobOrderCostInput[]
  start: Date
  end: Date
}): JobOrderCostResult {
  const { jobs, start, end } = input
  const inPeriod = (date: Date) => date.getTime() >= start.getTime() && date.getTime() <= end.getTime()

  const rows: TableRow[] = []
  const totals: JobOrderCostTotals = {
    materialCost: 0,
    productionCost: 0,
    totalCost: 0,
    completedQty: 0,
    unitCost: 0,
  }
  let withoutOutput = 0

  const visible = jobs
    .filter((job) => inPeriod(job.date))
    .sort((a, b) => {
      const byDate = a.date.getTime() - b.date.getTime()
      return byDate !== 0 ? byDate : a.documentNo.localeCompare(b.documentNo, "id-ID")
    })

  // Dikelompokkan per bulan, urut sesuai tanggal.
  const months = new Map<string, JobOrderCostInput[]>()
  for (const job of visible) {
    const key = monthLabel(job.date)
    months.set(key, [...(months.get(key) ?? []), job])
  }

  for (const [month, monthJobs] of months) {
    rows.push({ kind: "group", label: month })

    const monthTotals = { materialCost: 0, productionCost: 0, completedQty: 0 }

    for (const job of monthJobs) {
      const total = safeAdd(job.materialCost, job.productionCost, 2)
      if (job.completedQty <= 0 && total > 0) withoutOutput += 1

      monthTotals.materialCost = safeAdd(monthTotals.materialCost, job.materialCost, 2)
      monthTotals.productionCost = safeAdd(monthTotals.productionCost, job.productionCost, 2)
      monthTotals.completedQty += job.completedQty

      rows.push({
        kind: "data",
        cells: [
          `${job.documentNo}${job.customerName ? ` · ${job.customerName}` : ""}`,
          amount(job.materialCost),
          amount(job.productionCost),
          amount(total),
          job.completedQty > 0 ? quantity(job.completedQty) : "–",
          job.completedQty > 0 ? amount(total / job.completedQty) : NO_UNIT_COST,
        ],
      })
    }

    const monthTotal = safeAdd(monthTotals.materialCost, monthTotals.productionCost, 2)
    rows.push({
      kind: "total",
      label: `Jumlah ${month}`,
      cells: [
        "",
        amount(monthTotals.materialCost),
        amount(monthTotals.productionCost),
        amount(monthTotal),
        monthTotals.completedQty > 0 ? quantity(monthTotals.completedQty) : "–",
        monthTotals.completedQty > 0 ? amount(monthTotal / monthTotals.completedQty) : NO_UNIT_COST,
      ],
    })

    totals.materialCost = safeAdd(totals.materialCost, monthTotals.materialCost, 2)
    totals.productionCost = safeAdd(totals.productionCost, monthTotals.productionCost, 2)
    totals.completedQty += monthTotals.completedQty
  }

  totals.totalCost = safeAdd(totals.materialCost, totals.productionCost, 2)
  totals.unitCost = totals.completedQty > 0 ? totals.totalCost / totals.completedQty : 0

  if (visible.length === 0) {
    rows.push({
      kind: "notice",
      text: "Tidak ada perintah kerja pada periode ini. Ubah periode, atau buat perintah kerja di Produksi → Perintah Kerja.",
    })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [
        "",
        amount(totals.materialCost),
        amount(totals.productionCost),
        amount(totals.totalCost),
        totals.completedQty > 0 ? quantity(totals.completedQty) : "–",
        totals.completedQty > 0 ? amount(totals.unitCost) : NO_UNIT_COST,
      ],
    })
  }

  if (withoutOutput > 0) {
    rows.push({
      kind: "notice",
      text:
        `${withoutOutput} pekerjaan sudah menyerap biaya tetapi belum menghasilkan unit, jadi biaya per unitnya belum bisa ` +
        `dihitung — biayanya masih berstatus barang dalam proses (WIP).`,
    })
  }

  return { table: { columns: COLUMNS, rows }, totals, jobCount: visible.length, withoutOutput }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function jobOrderCostSummary(result: JobOrderCostResult): string {
  return (
    `${result.jobCount} pekerjaan: bahan ${formatCurrency(result.totals.materialCost)} · ` +
    `biaya produksi ${formatCurrency(result.totals.productionCost)} · total ` +
    `${formatCurrency(result.totals.totalCost)}`
  )
}

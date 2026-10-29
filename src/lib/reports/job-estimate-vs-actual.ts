/**
 * Estimasi vs aktual per pekerjaan (WorkOrder) — F-2026-10-20-04.
 *
 * Menjawab pertanyaan yang selama ini tak bisa dijawab dari data existing:
 * untuk satu pekerjaan, berapa nilai penawaran yang disetujui, berapa yang
 * benar-benar ditagih, berapa biaya aktualnya, dan berapa marginnya?
 *
 * - Estimasi = `Quotation.grandTotal` pada quotation yang terhubung ke
 *   pekerjaan dan berstatus accepted/approved/converted (loader yang
 *   memilih). Grand total itu nilai jual yang disetujui. **Biaya estimasi
 *   tidak punya sumber di schema** — tidak ada kolom biaya rencana per
 *   pekerjaan — jadi kolom itu sengaja tidak ada; menurunkannya dari nilai
 *   jual akan mengarang angka.
 * - Penagihan aktual memakai definisi `job-billing-summary` (invoice
 *   posted/partial/paid, belum terhapus) supaya semua laporan pekerjaan
 *   sepakat soal "sudah ditagih".
 * - Biaya aktual = `ProductionCost.amount` yang terikat langsung ke
 *   pekerjaan atau lewat perintah produksinya. Bahan tidak dijumlahkan
 *   terpisah: bahan perintah produksi sudah masuk `ProductionCost` saat
 *   issue, dan menjumlahkan keduanya akan menghitung bahan dua kali.
 *
 * Read-model murni dari kolom existing: tanpa migrasi, jurnal, atau status
 * baru. Pure (tanpa Prisma/DOM); loader DB ada di
 * `job-estimate-vs-actual-data.ts`.
 */

import { formatAccounting, formatCurrency } from "@/lib/utils/format"
import { safeRound, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 267mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Pekerjaan", align: "left", width: 52 },
  { header: "Kendaraan", align: "left", width: 38 },
  { header: "Estimasi Disetujui", align: "right", width: 38 },
  { header: "Penagihan Aktual", align: "right", width: 38 },
  { header: "Selisih Tagih−Estimasi", align: "right", width: 38 },
  { header: "Biaya Aktual", align: "right", width: 33 },
  { header: "Margin Aktual", align: "right", width: 30 },
  { header: "Estimasi Biaya", align: "right", width: 33 },
  { header: "Selisih Biaya", align: "right", width: 30 },
]

export interface JobEstimateVsActualInput {
  id: number
  documentNo: string
  date: Date
  status: string
  customerName: string | null
  /** Label kendaraan (plat · model); null bila pekerjaan tanpa kendaraan. */
  vehicleLabel: string | null
  /** Quotation.grandTotal yang disetujui; null = tidak ada penawaran disetujui. */
  estimateAmount: number | null
  /** Σ invoice yang terhitung ditagih (definisi job-billing-summary). */
  billedAmount: number
  /** Ada invoice yang terhitung ditagih. */
  hasBilling: boolean
  /** Σ ProductionCost terikat pekerjaan/perintah produksinya. */
  actualCost: number
  /** Snapshot estimasi biaya (R3); null = belum ada snapshot. */
  costEstimate: number | null
}

export interface JobEstimateVsActualRow {
  id: number
  documentNo: string
  estimateAmount: number | null
  billedAmount: number
  /** billed − estimasi; null selama tidak ada penawaran disetujui. */
  billingVariance: number | null
  actualCost: number
  /** billed − biaya aktual. */
  actualMargin: number
  /** Snapshot estimasi biaya (R3); null = belum ada snapshot. */
  costEstimate: number | null
  /** estimasi − aktual; null tanpa snapshot. */
  costVariance: number | null
  /** Tidak ada snapshot estimasi biaya. */
  noCostEstimate: boolean
  /** Tidak ada penawaran disetujui — selisih terhadap estimasi tak bermakna. */
  noApprovedEstimate: boolean
  /** Estimasi ada tetapi belum ada invoice yang terhitung ditagih. */
  unbilled: boolean
  /** Biaya aktual melampaui penagihan aktual. */
  costOverBilling: boolean
}

export interface JobEstimateVsActualTotals {
  estimate: number
  billed: number
  billingVariance: number
  actualCost: number
  actualMargin: number
  costEstimate: number
  costVariance: number
}

export interface JobEstimateVsActualResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  rows: JobEstimateVsActualRow[]
  totals: JobEstimateVsActualTotals
  jobCount: number
  withoutEstimate: number
  unbilledCount: number
  costOverBillingCount: number
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function noteOf(row: JobEstimateVsActualRow): string | null {
  const notes: string[] = []
  if (row.noApprovedEstimate) notes.push("belum ada penawaran disetujui")
  else if (row.unbilled) notes.push("belum ditagih")
  if (row.noCostEstimate) notes.push("belum ada snapshot estimasi biaya")
  if (row.costOverBilling) notes.push("biaya melampaui penagihan")
  return notes.length ? notes.join("; ") : null
}

export function buildJobEstimateVsActual(input: {
  jobs: JobEstimateVsActualInput[]
  start: Date
  end: Date
}): JobEstimateVsActualResult {
  const { jobs, start, end } = input
  const inPeriod = (date: Date) =>
    date.getTime() >= start.getTime() && date.getTime() <= end.getTime()

  const visible = jobs
    .filter((job) => inPeriod(job.date))
    .sort((a, b) => {
      const byDate = a.date.getTime() - b.date.getTime()
      return byDate !== 0 ? byDate : a.documentNo.localeCompare(b.documentNo, "id-ID")
    })

  const totals: JobEstimateVsActualTotals = {
    estimate: 0,
    billed: 0,
    billingVariance: 0,
    actualCost: 0,
    actualMargin: 0,
    costEstimate: 0,
    costVariance: 0,
  }
  let withoutEstimate = 0
  let unbilledCount = 0
  let costOverBillingCount = 0

  const rows: JobEstimateVsActualRow[] = visible.map((job) => {
    const estimate = job.estimateAmount === null ? null : safeRound(job.estimateAmount, 2)
    const billed = safeRound(job.billedAmount, 2)
    const actualCost = safeRound(job.actualCost, 2)
    const noApprovedEstimate = estimate === null
    // R3: selisih estimasi−aktual; null tanpa snapshot (bukan 0).
    const costEstimate = job.costEstimate === null ? null : safeRound(job.costEstimate, 2)
    const row: JobEstimateVsActualRow = {
      id: job.id,
      documentNo: job.documentNo,
      estimateAmount: estimate,
      billedAmount: billed,
      billingVariance: noApprovedEstimate ? null : safeSubtract(billed, estimate, 2),
      actualCost,
      actualMargin: safeSubtract(billed, actualCost, 2),
      costEstimate,
      costVariance: costEstimate === null ? null : safeSubtract(costEstimate, actualCost, 2),
      noCostEstimate: costEstimate === null,
      noApprovedEstimate,
      unbilled: !noApprovedEstimate && !job.hasBilling,
      costOverBilling: actualCost > billed,
    }
    totals.estimate += estimate ?? 0
    totals.billed += billed
    totals.billingVariance += row.billingVariance ?? 0
    totals.actualCost += actualCost
    totals.actualMargin += row.actualMargin
    totals.costEstimate += costEstimate ?? 0
    totals.costVariance += row.costVariance ?? 0
    if (row.noApprovedEstimate) withoutEstimate += 1
    if (row.unbilled) unbilledCount += 1
    if (row.costOverBilling) costOverBillingCount += 1
    return row
  })

  for (const key of Object.keys(totals) as (keyof JobEstimateVsActualTotals)[]) {
    totals[key] = safeRound(totals[key], 2)
  }

  const tableRows: TableRow[] = visible.map((job, index) => {
    const row = rows[index]
    const jobLabel = `${job.documentNo}${job.customerName ? ` · ${job.customerName}` : ""}`
    const vehicle = job.vehicleLabel ?? "Tanpa kendaraan"
    const note = noteOf(row)
    return {
      kind: "data",
      cells: [
        jobLabel,
        note ? `${vehicle} (${note})` : vehicle,
        row.estimateAmount === null ? "–" : amount(row.estimateAmount),
        amount(row.billedAmount),
        row.billingVariance === null ? "–" : amount(row.billingVariance),
        amount(row.actualCost),
        amount(row.actualMargin),
        row.costEstimate === null ? "–" : amount(row.costEstimate),
        row.costVariance === null ? "–" : amount(row.costVariance),
      ],
    }
  })

  if (visible.length === 0) {
    tableRows.push({
      kind: "notice",
      text: "Tidak ada perintah kerja pada periode ini. Ubah periode, atau buat perintah kerja di Produksi → Perintah Kerja.",
    })
  } else {
    tableRows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [
        "",
        "",
        amount(totals.estimate),
        amount(totals.billed),
        amount(totals.billingVariance),
        amount(totals.actualCost),
        amount(totals.actualMargin),
        amount(totals.costEstimate),
        amount(totals.costVariance),
      ],
    })
    if (withoutEstimate > 0) {
      tableRows.push({
        kind: "notice",
        text:
          `${withoutEstimate} pekerjaan belum punya penawaran yang disetujui, jadi selisih ` +
          `tagih−estimasi tidak dihitung untuk pekerjaan itu — hanya biaya dan margin aktualnya yang tampil.`,
      })
    }
    if (unbilledCount > 0 || costOverBillingCount > 0) {
      const parts: string[] = []
      if (unbilledCount > 0) parts.push(`${unbilledCount} pekerjaan berestimasi belum ditagih`)
      if (costOverBillingCount > 0)
        parts.push(`${costOverBillingCount} pekerjaan biayanya melampaui penagihannya`)
      tableRows.push({ kind: "notice", text: `${parts.join("; ")}.` })
    }
  }

  return {
    table: { columns: COLUMNS, rows: tableRows },
    rows,
    totals,
    jobCount: visible.length,
    withoutEstimate,
    unbilledCount,
    costOverBillingCount,
  }
}

/** Ringkasan satu baris untuk teks di bawah tabel laporan. */
export function jobEstimateVsActualSummary(result: JobEstimateVsActualResult): string {
  return (
    `${result.jobCount} pekerjaan: estimasi disetujui ${formatCurrency(result.totals.estimate)} · ` +
    `penagihan aktual ${formatCurrency(result.totals.billed)} · ` +
    `selisih ${formatCurrency(result.totals.billingVariance)} · ` +
    `biaya aktual ${formatCurrency(result.totals.actualCost)} · ` +
    `margin aktual ${formatCurrency(result.totals.actualMargin)}.`
  )
}

/**
 * Penerimaan & pembayaran per rekening bank — satu halaman untuk menjawab
 * "rekening ini masuk berapa, keluar berapa, dan sisanya berapa".
 *
 * Dua keputusan yang disengaja:
 *
 * - **Nilainya kas, bukan pelunasan piutang.** PPh yang dipotong pelanggan TIDAK
 *   pernah masuk rekening, jadi penerimaan memakai `SalesPayment.amount` saja.
 *   Memakai `amount + withholdingAmount` akan membuat mutasi bank tidak cocok
 *   dengan rekening koran — jenis salah saji yang paling sulit ditemukan.
 * - **Transaksi tanpa rekening tetap ditampilkan**, dikelompokkan sebagai "Tanpa
 *   rekening", bukan dibuang. Kalau dibuang, total laporan ini akan berbeda dari
 *   total pembayaran dan orang akan mencurigai laporannya, bukan datanya.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency, formatDate, formatNumber } from "@/lib/utils/format"
import { safeAdd, safeSubtract } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

const NO_ACCOUNT_KEY = "__tanpa_rekening__"

/** Lebar kolom (mm) — jumlahnya 267mm, area isi A4 mendatar. */
const SUMMARY_COLUMNS: TableColumn[] = [
  { header: "Rekening", align: "left", width: 100 },
  { header: "Penerimaan", align: "right", width: 45 },
  { header: "Pengeluaran", align: "right", width: 45 },
  { header: "Arus Bersih", align: "right", width: 45 },
  { header: "Transaksi", align: "right", width: 32 },
]

const DETAIL_COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 25 },
  { header: "Dokumen", align: "left", width: 38 },
  { header: "Jenis", align: "left", width: 25 },
  { header: "Lawan Transaksi", align: "left", width: 70 },
  { header: "Nilai", align: "right", width: 52 },
  { header: "Rekening", align: "right", width: 57 },
]

export type BankMovementKind = "Penerimaan" | "Pengeluaran"

export interface BankMovementInput {
  /** Akun kas/bank; `null` bila transaksi belum dipetakan ke rekening. */
  accountId: number | null
  accountCode: string | null
  accountName: string | null
  date: Date
  kind: BankMovementKind
  documentNo: string
  /** Pelanggan (penerimaan) atau vendor (pengeluaran). */
  counterparty: string | null
  /** Kas yang berpindah — sudah dalam rupiah penuh. */
  amount: number
}

export interface BankMovementSummary {
  accountKey: string
  label: string
  inflow: number
  outflow: number
  net: number
  count: number
}

export interface BankMovementsTotals {
  inflow: number
  outflow: number
  net: number
  count: number
}

export interface BankMovementsResult {
  summary: BankMovementSummary[]
  summaryTable: { columns: TableColumn[]; rows: TableRow[] }
  detailTable: { columns: TableColumn[]; rows: TableRow[] }
  totals: BankMovementsTotals
  /** Ada transaksi yang belum dipetakan ke rekening. */
  hasUnassigned: boolean
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function shortDate(date: Date): string {
  return formatDate(date, { format: "short" })
}

function accountLabel(movement: BankMovementInput): string {
  if (movement.accountCode && movement.accountName) {
    return `${movement.accountCode} ${movement.accountName}`
  }
  return movement.accountName ?? movement.accountCode ?? "Tanpa rekening"
}

/**
 * Susun ringkasan per rekening + rincian transaksi untuk periode [start, end].
 * Transaksi di luar periode diabaikan; yang di dalam periode tapi tanpa rekening
 * tetap masuk (lihat catatan di header berkas).
 */
export function buildBankMovements(input: {
  movements: BankMovementInput[]
  start: Date
  end: Date
}): BankMovementsResult {
  const { movements, start, end } = input
  const inPeriod = (date: Date) => date.getTime() >= start.getTime() && date.getTime() <= end.getTime()

  const visible = movements
    .filter((movement) => inPeriod(movement.date))
    .sort((a, b) => {
      const byDate = a.date.getTime() - b.date.getTime()
      if (byDate !== 0) return byDate
      return a.documentNo.localeCompare(b.documentNo, "id-ID")
    })

  const byAccount = new Map<string, BankMovementSummary>()
  const totals: BankMovementsTotals = { inflow: 0, outflow: 0, net: 0, count: 0 }

  for (const movement of visible) {
    const key = movement.accountId !== null ? String(movement.accountId) : NO_ACCOUNT_KEY
    const bucket = byAccount.get(key) ?? {
      accountKey: key,
      label: accountLabel(movement),
      inflow: 0,
      outflow: 0,
      net: 0,
      count: 0,
    }

    if (movement.kind === "Penerimaan") {
      bucket.inflow = safeAdd(bucket.inflow, movement.amount, 2)
      totals.inflow = safeAdd(totals.inflow, movement.amount, 2)
    } else {
      bucket.outflow = safeAdd(bucket.outflow, movement.amount, 2)
      totals.outflow = safeAdd(totals.outflow, movement.amount, 2)
    }

    bucket.net = safeSubtract(bucket.inflow, bucket.outflow, 2)
    bucket.count += 1
    byAccount.set(key, bucket)
    totals.count += 1
  }

  totals.net = safeSubtract(totals.inflow, totals.outflow, 2)

  // Tanpa rekening diletakkan paling akhir: ia anomali, bukan rekening.
  const summary = [...byAccount.values()].sort((a, b) => {
    if (a.accountKey === NO_ACCOUNT_KEY) return 1
    if (b.accountKey === NO_ACCOUNT_KEY) return -1
    return a.label.localeCompare(b.label, "id-ID")
  })

  const summaryRows: TableRow[] = summary.map((row) => ({
    kind: "data",
    cells: [
      row.label,
      amount(row.inflow),
      amount(row.outflow),
      amount(row.net),
      formatNumber(row.count),
    ],
  }))

  if (summary.length === 0) {
    summaryRows.push({
      kind: "notice",
      text: "Tidak ada penerimaan atau pembayaran pada periode ini. Ubah periode, atau catat pembayaran di Penjualan → Pembayaran dan Pembelian → Pembayaran Vendor.",
    })
  } else {
    summaryRows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [
        "",
        amount(totals.inflow),
        amount(totals.outflow),
        amount(totals.net),
        formatNumber(totals.count),
      ],
    })
  }

  const detailRows: TableRow[] = visible.map((movement) => ({
    kind: "data",
    cells: [
      shortDate(movement.date),
      movement.documentNo,
      movement.kind,
      movement.counterparty ?? "–",
      amount(movement.amount),
      accountLabel(movement),
    ],
  }))

  if (visible.length === 0) {
    detailRows.push({ kind: "notice", text: "Tidak ada transaksi bank pada periode ini." })
  }

  const hasUnassigned = byAccount.has(NO_ACCOUNT_KEY)
  if (hasUnassigned) {
    summaryRows.push({
      kind: "notice",
      text:
        "Ada transaksi yang belum dipetakan ke rekening kas/bank (baris \"Tanpa rekening\"). " +
        "Lengkapi rekening pada pembayaran tersebut supaya mutasi bank bisa dicocokkan dengan rekening koran.",
    })
  }

  return {
    summary,
    summaryTable: { columns: SUMMARY_COLUMNS, rows: summaryRows },
    detailTable: { columns: DETAIL_COLUMNS, rows: detailRows },
    totals,
    hasUnassigned,
  }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function bankMovementsSummary(result: BankMovementsResult): string {
  return (
    `${result.summary.length} rekening · penerimaan ${formatCurrency(result.totals.inflow)} · ` +
    `pengeluaran ${formatCurrency(result.totals.outflow)} · arus bersih ${formatCurrency(result.totals.net)}`
  )
}

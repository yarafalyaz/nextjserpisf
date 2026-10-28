/**
 * Transaksi bank terekonsiliasi vs belum — memisahkan baris rekening koran
 * yang sudah dicocokkan dengan buku (jurnal) dari yang belum, supaya sisa
 * pekerjaan rekonsiliasi terlihat sebagai angka, bukan tersembunyi di saldo.
 *
 * Definisi "terekonsiliasi" sengaja disebut di laporan, karena ia bisa berarti
 * dua hal di basis data kita:
 *
 * - baris sudah ditandai `matched` (kolom `bank_statement_lines.status`), **atau**
 * - baris punya item rekonsiliasi dengan `matched = true`
 *   (`matchReconciliationLine` menulis ke sini, bukan ke status baris).
 *
 * Memakai salah satu saja akan salah: penandaan lewat aksi aplikasi hanya
 * menyentuh item rekonsiliasi, sementara impor rekening koran bisa mengisi
 * status barisnya. Dua-duanya diterima, dan itu dinyatakan terang-terangan di
 * catatan laporan.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency, formatDate } from "@/lib/utils/format"
import { safeAdd } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 258mm + sisa area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 26 },
  { header: "Rekening", align: "left", width: 60 },
  { header: "Keterangan", align: "left", width: 74 },
  { header: "Referensi", align: "left", width: 34 },
  { header: "Masuk", align: "right", width: 32 },
  { header: "Keluar", align: "right", width: 32 },
]

export interface BankTransactionInput {
  date: Date
  /** Rekening kas/bank, mis. "110101 Kas". `null` bila tidak dipetakan. */
  accountLabel: string | null
  description: string | null
  reference: string | null
  /** Kas masuk — kolom debit rekening koran (uang bertambah di bank). */
  inflow: number
  /** Kas keluar — kolom kredit rekening koran. */
  outflow: number
  /** Sudah dicocokkan dengan buku (lihat catatan di atas). */
  reconciled: boolean
}

export interface BankTransactionGroup {
  count: number
  inflow: number
  outflow: number
}

export interface BankTransactionReconciliationResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  reconciled: BankTransactionGroup
  unreconciled: BankTransactionGroup
  /** Semua baris pada periode ini (terekonsiliasi + belum). */
  total: BankTransactionGroup
  verdict: string
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function shortDate(date: Date): string {
  return formatDate(date, { format: "short" })
}

function summarize(inputs: BankTransactionInput[]): BankTransactionGroup {
  return inputs.reduce<BankTransactionGroup>(
    (acc, item) => ({
      count: acc.count + 1,
      inflow: safeAdd(acc.inflow, item.inflow, 2),
      outflow: safeAdd(acc.outflow, item.outflow, 2),
    }),
    { count: 0, inflow: 0, outflow: 0 },
  )
}

/** Baris data satu transaksi bank. */
function dataRows(items: BankTransactionInput[]): TableRow[] {
  return items.map((item) => ({
    kind: "data",
    cells: [
      shortDate(item.date),
      item.accountLabel ?? "Tanpa rekening",
      item.description ?? "–",
      item.reference ?? "–",
      amount(item.inflow),
      amount(item.outflow),
    ],
  }))
}

export function buildBankTransactionReconciliation(
  inputs: BankTransactionInput[],
): BankTransactionReconciliationResult {
  const sorted = [...inputs].sort((a, b) => {
    const byDate = a.date.getTime() - b.date.getTime()
    return byDate !== 0 ? byDate : (a.reference ?? "").localeCompare(b.reference ?? "", "id-ID")
  })

  const reconciledItems = sorted.filter((item) => item.reconciled)
  const unreconciledItems = sorted.filter((item) => !item.reconciled)

  const reconciled = summarize(reconciledItems)
  const unreconciled = summarize(unreconciledItems)
  const total = summarize(sorted)

  const rows: TableRow[] = []

  rows.push({ kind: "group", label: `Terekonsiliasi (${reconciled.count})` })
  if (reconciledItems.length === 0) {
    rows.push({
      kind: "notice",
      text: "Tidak ada baris rekening koran yang sudah dicocokkan pada periode ini.",
    })
  } else {
    rows.push(...dataRows(reconciledItems))
    rows.push({
      kind: "total",
      label: "Subtotal terekonsiliasi",
      cells: [amount(reconciled.inflow), amount(reconciled.outflow)],
    })
  }

  rows.push({ kind: "group", label: `Belum Terekonsiliasi (${unreconciled.count})` })
  if (unreconciledItems.length === 0) {
    rows.push({
      kind: "notice",
      text: "Semua baris rekening koran pada periode ini sudah dicocokkan.",
    })
  } else {
    rows.push(...dataRows(unreconciledItems))
    rows.push({
      kind: "total",
      label: "Subtotal belum terekonsiliasi",
      cells: [amount(unreconciled.inflow), amount(unreconciled.outflow)],
    })
  }

  if (sorted.length === 0) {
    rows.push({
      kind: "notice",
      text:
        "Tidak ada baris rekening koran pada periode ini. Impor rekening koran lebih dulu di " +
        "Keuangan → Rekening Koran, atau ubah periode laporan.",
    })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah",
      cells: [amount(total.inflow), amount(total.outflow)],
    })
  }

  if (sorted.length > 0) {
    rows.push({
      kind: "notice",
      text:
        "Baris dianggap terekonsiliasi bila statusnya sudah ditandai \"matched\" atau ia dipakai " +
        "oleh item rekonsiliasi yang dicocokkan. Baris belum terekonsiliasi adalah sisa yang masih " +
        "perlu dicocokkan lewat Keuangan → Rekonsiliasi Bank.",
    })
  }

  const verdict =
    sorted.length === 0
      ? "Tidak ada transaksi bank pada periode ini"
      : unreconciled.count === 0
        ? `${reconciled.count} transaksi bank, semuanya terekonsiliasi`
        : `${unreconciled.count} dari ${total.count} transaksi bank belum terekonsiliasi`

  return {
    table: { columns: COLUMNS, rows },
    reconciled,
    unreconciled,
    total,
    verdict,
  }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function bankTransactionSummary(result: BankTransactionReconciliationResult): string {
  if (result.total.count === 0) return "Tidak ada transaksi bank pada periode ini"
  return (
    `${result.total.count} transaksi · terekonsiliasi ${result.reconciled.count} · ` +
    `belum ${result.unreconciled.count} · belum terekonsiliasi senilai ` +
    `${formatCurrency(safeAdd(result.unreconciled.inflow, result.unreconciled.outflow, 2))}`
  )
}

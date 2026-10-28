/**
 * Giro mundur — daftar giro/cek yang **belum jatuh tempo** (Accurate: "Giro
 * Mundur (Belum Jatuh Tempo)"), plus yang sudah jatuh tempo tetapi belum
 * dicairkan.
 *
 * Hanya baris berstatus `pending` yang dihitung: giro yang sudah `cleared`
 * (cair) atau `cancelled` (batal) tidak lagi "mundur", jadi memasukkannya akan
 * membuat laporan terlihat punya kewajiban/hak yang sebenarnya sudah selesai.
 *
 * Dua kelompok sengaja dipisah, karena tindakannya berbeda: yang belum jatuh
 * tempo perlu *disiapkan* dananya, yang sudah jatuh tempo tetapi belum cair
 * perlu *dikejar/diperiksa* — menyatukannya menyembunyikan yang terlambat.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency, formatDate } from "@/lib/utils/format"
import { safeAdd } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

const DAY_MS = 24 * 60 * 60 * 1000

/** Lebar kolom (mm) — jumlahnya 266mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Jatuh Tempo", align: "left", width: 26 },
  { header: "No. Dokumen", align: "left", width: 38 },
  { header: "Jenis", align: "left", width: 18 },
  { header: "Pihak", align: "left", width: 50 },
  { header: "Nomor", align: "left", width: 30 },
  { header: "Rekening", align: "left", width: 50 },
  { header: "Nominal", align: "right", width: 30 },
  { header: "Sisa Hari", align: "right", width: 24 },
]

export interface ChequeInput {
  documentNo: string
  /** "giro" | "cek". */
  type: string
  /** "in" diterima, "out" dikeluarkan. */
  direction: string
  number: string | null
  party: string | null
  accountLabel: string | null
  amount: number
  dueDate: Date
  /** "pending" | "cleared" | "cancelled". */
  status: string
}

export interface PostDatedGroup {
  count: number
  amount: number
}

export interface PostDatedChequesResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  /** Belum jatuh tempo pada tanggal acuan. */
  notDue: PostDatedGroup
  /** Sudah jatuh tempo tetapi belum dicairkan. */
  overdue: PostDatedGroup
  /** Baris pending yang tidak masuk periode ini (mis. jauh ke depan). */
  verdict: string
}

function amountCell(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function shortDate(date: Date): string {
  return formatDate(date, { format: "short" })
}

/** Sisa hari sampai jatuh tempo (negatif = sudah lewat). */
export function daysUntilDue(dueDate: Date, asOf: Date): number {
  const start = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate()).getTime()
  const end = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime()
  return Math.round((end - start) / DAY_MS)
}

function summarize(items: ChequeInput[]): PostDatedGroup {
  return items.reduce<PostDatedGroup>(
    (acc, item) => ({ count: acc.count + 1, amount: safeAdd(acc.amount, item.amount, 2) }),
    { count: 0, amount: 0 },
  )
}

function sortByDueDate(items: ChequeInput[]): ChequeInput[] {
  return [...items].sort((a, b) => {
    const byDate = a.dueDate.getTime() - b.dueDate.getTime()
    return byDate !== 0 ? byDate : a.documentNo.localeCompare(b.documentNo, "id-ID")
  })
}

function dataRows(items: ChequeInput[], asOf: Date): TableRow[] {
  return items.map((item) => {
    const days = daysUntilDue(item.dueDate, asOf)
    return {
      kind: "data",
      cells: [
        shortDate(item.dueDate),
        item.documentNo,
        item.type === "cek" ? "Cek" : "Giro",
        item.party ?? "–",
        item.number ?? "–",
        item.accountLabel ?? "–",
        amountCell(item.amount),
        days >= 0 ? String(days) : `${days} (lewat)`,
      ],
    }
  })
}

export function buildPostDatedCheques(input: {
  cheques: ChequeInput[]
  asOf: Date
}): PostDatedChequesResult {
  const { cheques, asOf } = input
  const pending = cheques.filter((cheque) => cheque.status === "pending")

  const notDueItems = sortByDueDate(
    pending.filter((cheque) => daysUntilDue(cheque.dueDate, asOf) > 0),
  )
  const overdueItems = sortByDueDate(
    pending.filter((cheque) => daysUntilDue(cheque.dueDate, asOf) <= 0),
  )

  const notDue = summarize(notDueItems)
  const overdue = summarize(overdueItems)

  const rows: TableRow[] = []

  rows.push({ kind: "group", label: `Belum Jatuh Tempo (${notDue.count})` })
  if (notDueItems.length === 0) {
    rows.push({
      kind: "notice",
      text: "Tidak ada giro/cek yang belum jatuh tempo pada tanggal acuan.",
    })
  } else {
    rows.push(...dataRows(notDueItems, asOf))
    rows.push({ kind: "total", label: "Subtotal belum jatuh tempo", cells: [amountCell(notDue.amount)] })
  }

  rows.push({ kind: "group", label: `Jatuh Tempo, Belum Dicairkan (${overdue.count})` })
  if (overdueItems.length === 0) {
    rows.push({
      kind: "notice",
      text: "Tidak ada giro/cek yang sudah jatuh tempo tetapi belum dicairkan.",
    })
  } else {
    rows.push(...dataRows(overdueItems, asOf))
    rows.push({ kind: "total", label: "Subtotal sudah jatuh tempo", cells: [amountCell(overdue.amount)] })
  }

  if (notDue.count === 0 && overdue.count === 0 && pending.length === 0) {
    rows.push({
      kind: "notice",
      text:
        "Belum ada giro/cek berstatus \"Belum Cair\". Catat giro mundur di Keuangan → Giro & Cek " +
        "agar laporan ini terisi.",
    })
  }

  rows.push({
    kind: "notice",
    text:
      "Hanya giro/cek berstatus \"Belum Cair\" yang dihitung; yang sudah cair atau dibatalkan " +
      "tidak lagi termasuk giro mundur. Tanggal acuan: " +
      shortDate(asOf) +
      ".",
  })

  const verdict =
    notDue.count === 0 && overdue.count === 0
      ? "Tidak ada giro mundur"
      : `${notDue.count} belum jatuh tempo (${formatCurrency(notDue.amount)})` +
        (overdue.count > 0
          ? ` · ${overdue.count} sudah jatuh tempo belum dicairkan (${formatCurrency(overdue.amount)})`
          : "")

  return { table: { columns: COLUMNS, rows }, notDue, overdue, verdict }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function postDatedChequesSummary(result: PostDatedChequesResult): string {
  if (result.notDue.count === 0 && result.overdue.count === 0) {
    return "Tidak ada giro/cek belum cair"
  }
  return (
    `Belum jatuh tempo ${formatCurrency(result.notDue.amount)} (${result.notDue.count})` +
    (result.overdue.count > 0
      ? ` · sudah jatuh tempo ${formatCurrency(result.overdue.amount)} (${result.overdue.count})`
      : "")
  )
}

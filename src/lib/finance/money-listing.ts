/**
 * Kerangka laporan daftar uang berbagi: urut tanggal-desc + nomor dokumen,
 * total presisi sen, baris total + keterangan + verdict.
 *
 * Diekstrak dari tax-payment.ts/purchase-advance.ts yang dulu menyalin blok
 * 13 baris identik (Sonar duplication PR #25 4.7% > 3%).
 */
import { safeAdd } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface MoneyListingLine {
  date: Date
  documentNo: string
  amount: number
}

export function buildMoneyListing<T extends MoneyListingLine>(input: {
  lines: T[]
  columns: TableColumn[]
  cells: (line: T) => string[]
  emptyNotice: string
  verdictNotice: string
  emptyVerdict: string
  verdict: (count: number, amount: number) => string
  totalCells: (count: number, amount: number) => string[]
}): { table: { columns: TableColumn[]; rows: TableRow[] }; totals: { count: number; amount: number }; verdict: string } {
  const sorted = [...input.lines].sort((a, b) => {
    const byDate = b.date.getTime() - a.date.getTime()
    return byDate !== 0 ? byDate : a.documentNo.localeCompare(b.documentNo, "id-ID")
  })
  let amount = 0
  const rows: TableRow[] = sorted.map((line) => {
    amount = safeAdd(amount, line.amount, 2)
    return { kind: "data", cells: input.cells(line) }
  })
  if (sorted.length === 0) {
    rows.push({ kind: "notice", text: input.emptyNotice })
  } else {
    rows.push({ kind: "total", grand: true, label: "Jumlah", cells: input.totalCells(sorted.length, amount) })
  }
  rows.push({ kind: "notice", text: input.verdictNotice })
  return {
    table: { columns: input.columns, rows },
    totals: { count: sorted.length, amount },
    verdict: sorted.length === 0 ? input.emptyVerdict : input.verdict(sorted.length, amount),
  }
}

/**
 * Neraca Induk Skontro — neraca bentuk dua sisi: Aktiva di kiri, Pasiva
 * (kewajiban + ekuitas) di kanan, dengan jumlah masing-masing sisi di bawahnya.
 *
 * Bentuk ini bukan laporan baru secara data: ia memakai bagian neraca yang sama
 * (`loadBalanceSheetParts`) dan hanya menyusunnya berdampingan. Baris dipasangkan
 * menurut urutan (baris ke-n kiri dengan baris ke-n kanan); sisi yang lebih
 * panjang menyisakan sel kosong. Karena itu **jumlah tiap sisi** tetap
 * dibandingkan di baris penutup — bila identitas akuntansi tidak menutup, laporan
 * menyebut selisihnya, bukan memaksa tampak seimbang.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting } from "@/lib/utils/format"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 264mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Kode", align: "left", width: 24 },
  { header: "Aktiva", align: "left", width: 74 },
  { header: "Jumlah (Rp)", align: "right", width: 34 },
  { header: "Kode", align: "left", width: 24 },
  { header: "Pasiva", align: "left", width: 74 },
  { header: "Jumlah (Rp)", align: "right", width: 34 },
]

export interface SkontroLine {
  code: string
  name: string
  balance: number
  /** Baris akun induk (punya anak) ditampilkan sebagai judul, bukan angka. */
  hasChildren?: boolean
}

/** Satu sel baris pada satu sisi. `amount` kosong = sel kosong. */
interface SideCell {
  code: string
  name: string
  amount: string
  bold?: boolean
}

export interface SkontroBalanceSheetInput {
  assetRows: SkontroLine[]
  liabilityRows: SkontroLine[]
  equityRows: SkontroLine[]
  totalAssets: number
  totalLiabilities: number
  totalEquity: number
  isBalanced: boolean
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function linesToCells(rows: SkontroLine[]): SideCell[] {
  return rows.map((row) => ({
    code: row.code,
    name: row.name,
    // Akun induk tidak diberi nominal (saldo anaknya sudah dijumlahkan), agar
    // dua sisi tidak terlihat punya angka ganda.
    amount: row.hasChildren ? "" : amount(row.balance),
    bold: row.hasChildren,
  }))
}

function heading(label: string): SideCell {
  return { code: "", name: label, amount: "", bold: true }
}

export function buildSkontroBalanceSheet(input: SkontroBalanceSheetInput): {
  columns: TableColumn[]
  rows: TableRow[]
} {
  const left: SideCell[] = [heading("Aktiva"), ...linesToCells(input.assetRows)]
  const right: SideCell[] = [
    heading("Kewajiban"),
    ...linesToCells(input.liabilityRows),
    heading("Ekuitas"),
    ...linesToCells(input.equityRows),
  ]

  const rows: TableRow[] = []
  const height = Math.max(left.length, right.length)
  const empty: SideCell = { code: "", name: "", amount: "" }

  for (let index = 0; index < height; index += 1) {
    const l = left[index] ?? empty
    const r = right[index] ?? empty
    rows.push({
      kind: "data",
      bold: Boolean(l.bold || r.bold),
      cells: [l.code, l.name, l.amount, r.code, r.name, r.amount],
    })
  }

  const totalLiabilitiesAndEquity = input.totalLiabilities + input.totalEquity
  rows.push({
    kind: "data",
    bold: true,
    cells: ["", "Jumlah Aktiva", amount(input.totalAssets), "", "Jumlah Pasiva", amount(totalLiabilitiesAndEquity)],
  })

  if (!input.isBalanced) {
    rows.push({
      kind: "notice",
      text:
        `Perhatian: Jumlah Aktiva (${amount(input.totalAssets)}) tidak sama dengan Jumlah Pasiva ` +
        `(${amount(totalLiabilitiesAndEquity)}) — selisih ${amount(input.totalAssets - totalLiabilitiesAndEquity)}.`,
    })
  }

  return { columns: COLUMNS, rows }
}

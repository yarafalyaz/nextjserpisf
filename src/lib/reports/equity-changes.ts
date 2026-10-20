/**
 * Perubahan Ekuitas & Laba Ditahan.
 *
 * Dua laporan, satu sumber angka: mutasi tiap akun ekuitas selama periode
 * (saldo awal → mutasi → saldo akhir). **Laba bersih periode ditampilkan sebagai
 * baris tersendiri**, bukan diam-diam ditambahkan ke ekuitas: tanpa jurnal
 * penutup, laba periode memang belum dipindahkan ke akun ekuitas, jadi
 * menambahkannya akan membuat "saldo akhir" tidak sama dengan buku besar. Baris
 * "bila laba ditutup" menampilkan hasilnya bila nanti ditutup — dinyatakan, bukan
 * diasumsikan.
 *
 * Laba Ditahan dikenali dari nama akun (COA standar menamainya "Laba Ditahan").
 * Bila tidak ada akun yang cocok, laporan mengatakannya terang-terangan — bukan
 * menampilkan angka 0 yang terbaca "tidak ada laba ditahan".
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting } from "@/lib/utils/format"
import { safeAdd } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface EquityAccountRow {
  id: number
  code: string
  name: string
  opening: number
  movement: number
  closing: number
}

export interface EquityChangesResult {
  accounts: EquityAccountRow[]
  totals: { opening: number; movement: number; closing: number }
  netProfit: number
  /** Total ekuitas akhir bila laba periode ditutup ke ekuitas. */
  closingWithProfit: number
}

export function buildEquityChanges(
  accounts: EquityAccountRow[],
  netProfit: number,
): EquityChangesResult {
  const totals = accounts.reduce(
    (acc, account) => ({
      opening: safeAdd(acc.opening, account.opening, 2),
      movement: safeAdd(acc.movement, account.movement, 2),
      closing: safeAdd(acc.closing, account.closing, 2),
    }),
    { opening: 0, movement: 0, closing: 0 },
  )

  return {
    accounts: [...accounts].sort((a, b) => a.code.localeCompare(b.code, "id-ID")),
    totals,
    netProfit,
    closingWithProfit: safeAdd(totals.closing, netProfit, 2),
  }
}

/** Akun ekuitas yang menyimpan laba ditahan (COA standar: "Laba Ditahan"). */
export function isRetainedEarningsAccount(name: string): boolean {
  return /laba\s*ditahan/i.test(name)
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

const EQUITY_COLUMNS: TableColumn[] = [
  { header: "Akun", align: "left", width: 96 },
  { header: "Kode", align: "left", width: 26 },
  { header: "Saldo Awal", align: "right", width: 46 },
  { header: "Mutasi", align: "right", width: 46 },
  { header: "Saldo Akhir", align: "right", width: 46 },
]

export function buildEquityChangesTable(result: EquityChangesResult): {
  columns: TableColumn[]
  rows: TableRow[]
} {
  const rows: TableRow[] = []

  for (const account of result.accounts) {
    rows.push({
      kind: "data",
      cells: [account.name, account.code, amount(account.opening), amount(account.movement), amount(account.closing)],
    })
  }

  if (result.accounts.length === 0) {
    rows.push({
      kind: "notice",
      text: "Belum ada akun ekuitas yang bersaldo. Periksa jurnal atau bagan akun.",
    })
  }

  rows.push({
    kind: "total",
    label: "Jumlah Ekuitas",
    cells: [amount(result.totals.opening), amount(result.totals.movement), amount(result.totals.closing)],
  })

  rows.push({
    kind: "data",
    cells: ["Laba Bersih Periode (belum ditutup)", "", "", amount(result.netProfit), ""],
  })
  rows.push({
    kind: "total",
    grand: true,
    label: "Ekuitas Akhir Bila Laba Ditutup",
    cells: [amount(result.closingWithProfit)],
  })

  rows.push({
    kind: "notice",
    text:
      "Laba bersih periode ditampilkan terpisah karena belum dipindahkan ke akun ekuitas oleh " +
      "jurnal penutup; \"Saldo Akhir\" adalah saldo buku besar apa adanya. Baris terakhir " +
      "menunjukkan hasilnya bila laba periode ditutup.",
  })

  return { columns: EQUITY_COLUMNS, rows }
}

const RETAINED_COLUMNS: TableColumn[] = [
  { header: "Uraian", align: "left", width: 150 },
  { header: "Nilai", align: "right", width: 116 },
]

export interface RetainedEarningsResult {
  rows: EquityAccountRow[]
  opening: number
  movement: number
  closing: number
  netProfit: number
  closingWithProfit: number
  hasAccount: boolean
}

export function buildRetainedEarnings(
  accounts: EquityAccountRow[],
  netProfit: number,
): RetainedEarningsResult {
  const matched = accounts.filter((account) => isRetainedEarningsAccount(account.name))
  const totals = matched.reduce(
    (acc, account) => ({
      opening: safeAdd(acc.opening, account.opening, 2),
      movement: safeAdd(acc.movement, account.movement, 2),
      closing: safeAdd(acc.closing, account.closing, 2),
    }),
    { opening: 0, movement: 0, closing: 0 },
  )

  return {
    rows: matched,
    ...totals,
    netProfit,
    closingWithProfit: safeAdd(totals.closing, netProfit, 2),
    hasAccount: matched.length > 0,
  }
}

export function buildRetainedEarningsTable(result: RetainedEarningsResult): {
  columns: TableColumn[]
  rows: TableRow[]
} {
  if (!result.hasAccount) {
    return {
      columns: RETAINED_COLUMNS,
      rows: [
        {
          kind: "notice",
          text:
            "Tidak ada akun ekuitas bernama \"Laba Ditahan\" di bagan akun, jadi laporan ini belum " +
            "bisa menilai apa-apa. Tambahkan akun laba ditahan (atau sebutkan namanya) lebih dulu — " +
            "nilai kosong di sini berarti belum dipetakan, bukan berarti laba ditahan nol.",
        },
      ],
    }
  }

  const rows: TableRow[] = []
  if (result.rows.length > 1) {
    rows.push({ kind: "group", label: "Akun Laba Ditahan" })
    for (const account of result.rows) {
      rows.push({
        kind: "data",
        cells: [`${account.code} ${account.name}`, amount(account.closing)],
      })
    }
  }

  rows.push({ kind: "data", cells: ["Saldo Awal", amount(result.opening)] })
  rows.push({ kind: "data", cells: ["Mutasi Selama Periode", amount(result.movement)] })
  rows.push({ kind: "total", label: "Saldo Akhir", cells: [amount(result.closing)] })
  rows.push({ kind: "data", cells: ["Laba Bersih Periode (belum ditutup)", amount(result.netProfit)] })
  rows.push({
    kind: "total",
    grand: true,
    label: "Saldo Akhir Bila Laba Ditutup",
    cells: [amount(result.closingWithProfit)],
  })
  rows.push({
    kind: "notice",
    text:
      "Saldo Akhir adalah saldo akun laba ditahan menurut buku besar. Laba bersih periode belum " +
      "dipindahkan ke akun ini kecuali sudah ada jurnal penutup, sehingga baris terakhir " +
      "menunjukkan saldonya bila laba periode ditutup.",
  })

  return { columns: RETAINED_COLUMNS, rows }
}

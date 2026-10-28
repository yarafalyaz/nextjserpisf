/**
 * Rincian beban pembayaran — biaya bank/administrasi yang benar-benar keluar saat
 * membayar atau saat menerima barang, mis. "Admin BCA 1.000" yang tercetak pada
 * pembelian Tokopedia/Shopee.
 *
 * Beban ini sengaja tidak ikut dalam pelunasan tagihan: ia **biaya membayar**,
 * bukan bagian dari utang — lihat `VendorPayment.adminFee` dan
 * `GoodsReceipt.adminFee` di skema. Karena itu laporan ini memisahkannya dari
 * nilai pembayaran; mencampurnya membuat utang tampak belum lunas padahal sudah.
 *
 * Hanya baris berbeban > 0 yang masuk (sumbernya menyaring), dan hasilnya
 * dikelompokkan per asal biaya supaya kelihatan dari mana beban itu datang.
 *
 * Pure (tanpa Prisma/DOM).
 */

import { formatAccounting, formatCurrency, formatDate } from "@/lib/utils/format"
import { safeAdd } from "@/lib/utils/math"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

/** Lebar kolom (mm) — jumlahnya 267mm, area isi A4 mendatar. */
const COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 25 },
  { header: "Dokumen", align: "left", width: 38 },
  { header: "Asal Biaya", align: "left", width: 32 },
  { header: "Lawan Transaksi", align: "left", width: 105 },
  { header: "Beban Admin", align: "right", width: 67 },
]

export const PAYMENT_EXPENSE_SOURCES = ["Pembayaran Vendor", "Penerimaan Barang"] as const
export type PaymentExpenseSource = (typeof PAYMENT_EXPENSE_SOURCES)[number]

export interface PaymentExpenseInput {
  date: Date
  documentNo: string
  source: PaymentExpenseSource
  /** Vendor / pemasok terkait. */
  counterparty: string | null
  adminFee: number
}

export interface PaymentExpenseSourceSummary {
  source: PaymentExpenseSource
  count: number
  adminFee: number
}

export interface PaymentExpensesResult {
  table: { columns: TableColumn[]; rows: TableRow[] }
  bySource: PaymentExpenseSourceSummary[]
  totals: { count: number; adminFee: number }
}

function amount(value: number): string {
  return formatAccounting(value, { zeroDash: false })
}

function shortDate(date: Date): string {
  return formatDate(date, { format: "short" })
}

/**
 * Susun rincian beban pembayaran untuk periode [start, end], dikelompokkan per
 * asal biaya (pembayaran vendor dulu, lalu penerimaan barang) dengan subtotal
 * masing-masing dan jumlah akhir.
 */
export function buildPaymentExpenses(input: {
  expenses: PaymentExpenseInput[]
  start: Date
  end: Date
}): PaymentExpensesResult {
  const { expenses, start, end } = input
  const inPeriod = (date: Date) => date.getTime() >= start.getTime() && date.getTime() <= end.getTime()

  const visible = expenses
    .filter((expense) => inPeriod(expense.date) && expense.adminFee > 0)
    .sort((a, b) => {
      const byDate = a.date.getTime() - b.date.getTime()
      return byDate !== 0 ? byDate : a.documentNo.localeCompare(b.documentNo, "id-ID")
    })

  const rows: TableRow[] = []
  const totals = { count: 0, adminFee: 0 }
  const bySource: PaymentExpenseSourceSummary[] = []

  for (const source of PAYMENT_EXPENSE_SOURCES) {
    const group = visible.filter((expense) => expense.source === source)
    if (group.length === 0) continue

    const subtotal = group.reduce((sum, expense) => safeAdd(sum, expense.adminFee, 2), 0)
    rows.push({ kind: "group", label: source })

    for (const expense of group) {
      rows.push({
        kind: "data",
        cells: [
          shortDate(expense.date),
          expense.documentNo,
          expense.source,
          expense.counterparty ?? "–",
          amount(expense.adminFee),
        ],
      })
    }

    rows.push({
      kind: "total",
      label: `Jumlah ${source}`,
      cells: ["", "", "", "", amount(subtotal)],
    })

    bySource.push({ source, count: group.length, adminFee: subtotal })
    totals.count += group.length
    totals.adminFee = safeAdd(totals.adminFee, subtotal, 2)
  }

  if (visible.length === 0) {
    rows.push({
      kind: "notice",
      text:
        "Tidak ada beban bank/administrasi pada periode ini. Beban dicatat saat mengisi kolom beban admin " +
        "pada pembayaran vendor atau penerimaan barang.",
    })
  } else {
    rows.push({
      kind: "total",
      grand: true,
      label: "Jumlah Beban",
      cells: ["", "", "", "", amount(totals.adminFee)],
    })
  }

  return { table: { columns: COLUMNS, rows }, bySource, totals }
}

/** Ringkasan satu baris untuk KPI di halaman laporan. */
export function paymentExpensesSummary(result: PaymentExpensesResult): string {
  const perSource = result.bySource
    .map((summary) => `${summary.source} ${summary.count} dokumen (${formatCurrency(summary.adminFee)})`)
    .join(" · ")
  return `${result.totals.count} dokumen · total beban ${formatCurrency(result.totals.adminFee)}${perSource ? ` — ${perSource}` : ""}`
}

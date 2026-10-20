/**
 * Agregasi arus kas laporan, presisi sen.
 *
 * Page `/laporan/arus-kas` dan loader PDF `loadCashFlow` sebelumnya
 * mengakumulasi penerimaan/pengeluaran per bulan, total periode, dan
 * saldo awal/akhir dengan `+=`/`-` float mentah: 17 mutasi 0.24
 * terakumulasi 4.080000000000002, sehingga saldo akhir bisa drift sen
 * dari jumlah baris yang ditampilkan. Di sini tiap langkah memakai
 * safeAdd/safeSubtract 2 desimal (pola `buildLedgerRows`).
 *
 * `activities` datang dari `foldActivities` (`lib/finance/cash-flow`)
 * yang sudah sen-aman per jurnal; neto aktivitas di sini hanya
 * dinormalkan sen supaya baris "Kenaikan/(Penurunan) Kas Bersih" di
 * PDF tidak membawa drift penjumlahan tiga aktivitas.
 */

import { safeAdd, safeSubtract } from "@/lib/utils/math"

export interface CashFlowEntryInput {
  date: Date
  debit: unknown
  credit: unknown
}

export interface CashMonthlyBucket {
  /** Kunci `YYYY-MM` dari tanggal jurnal (kalender lokal server). */
  month: string
  inflow: number
  outflow: number
  net: number
}

export interface CashFlowTotals {
  monthly: CashMonthlyBucket[]
  totalInflow: number
  totalOutflow: number
  /** Arus bersih periode dari baris kas: totalInflow - totalOutflow. */
  netCashFlow: number
  openingBalance: number
  closingBalance: number
  /** Neto tiga aktivitas (operasi+investasi+pendanaan), sen persis. */
  activityNet: number
}

export function buildCashFlowTotals(input: {
  entries: readonly CashFlowEntryInput[]
  /** Saldo per akun kas sebelum periode: debit-kredit agregat DB. */
  priorBalances: readonly { debit: unknown; credit: unknown }[]
  activities: { operating: number; investing: number; financing: number }
}): CashFlowTotals {
  const buckets = new Map<string, { inflow: number; outflow: number }>()
  let totalInflow = 0
  let totalOutflow = 0
  for (const entry of input.entries) {
    const debit = safeAdd(entry.debit as never, 0, 2)
    const credit = safeAdd(entry.credit as never, 0, 2)
    const monthKey = `${entry.date.getFullYear()}-${String(entry.date.getMonth() + 1).padStart(2, "0")}`
    const bucket = buckets.get(monthKey) ?? { inflow: 0, outflow: 0 }
    bucket.inflow = safeAdd(bucket.inflow, debit, 2)
    bucket.outflow = safeAdd(bucket.outflow, credit, 2)
    buckets.set(monthKey, bucket)
    totalInflow = safeAdd(totalInflow, debit, 2)
    totalOutflow = safeAdd(totalOutflow, credit, 2)
  }
  const monthly: CashMonthlyBucket[] = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, bucket]) => ({
      month,
      inflow: bucket.inflow,
      outflow: bucket.outflow,
      net: safeSubtract(bucket.inflow, bucket.outflow, 2),
    }))
  const netCashFlow = safeSubtract(totalInflow, totalOutflow, 2)
  const openingBalance = input.priorBalances.reduce(
    (sum, balance) => safeAdd(sum, safeSubtract(balance.debit as never, balance.credit as never, 2), 2),
    0,
  )
  const activityNet = safeAdd(
    safeAdd(input.activities.operating, input.activities.investing, 2),
    input.activities.financing,
    2,
  )
  return {
    monthly,
    totalInflow,
    totalOutflow,
    netCashFlow,
    openingBalance,
    closingBalance: safeAdd(openingBalance, netCashFlow, 2),
    activityNet,
  }
}

/**
 * Pemuatan data untuk halaman **Proses Akhir Bulan**.
 *
 * Bulan yang diperiksa diambil dari path `/periode/YYYY-MM`; bawaannya **bulan lalu**
 * (bulan yang biasanya baru saja selesai dan hendak ditutup) — bukan bulan berjalan,
 * yang masih berjalan dan belum untuk ditutup.
 */

import { prisma } from "@/lib/db/prisma"
import { buildPeriodCloseChecks, type PeriodCloseResult } from "@/lib/settings/period-close"

const MONTHS_ID = [
  "Januari",
  "Februari",
  "Maret",
  "April",
  "Mei",
  "Juni",
  "Juli",
  "Agustus",
  "September",
  "Oktober",
  "November",
  "Desember",
]

export interface CloseMonth {
  start: Date
  end: Date
  label: string
  /** Kunci stabil `YYYY-MM` untuk pemilih bulan. */
  key: string
}

export function resolveCloseMonth(periode: string | undefined, now = new Date()): CloseMonth {
  const match = /^(\d{4})-(\d{2})$/.exec((periode ?? "").trim())
  let year: number
  let month: number
  if (match) {
    year = Number(match[1])
    month = Number(match[2]) - 1
  } else {
    const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    year = previous.getFullYear()
    month = previous.getMonth()
  }

  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 0, 23, 59, 59, 999),
    label: `${MONTHS_ID[month]} ${year}`,
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
  }
}

export interface PeriodCloseData {
  month: CloseMonth
  result: PeriodCloseResult
}

export async function loadPeriodClose(periode: string | undefined): Promise<PeriodCloseData> {
  const month = resolveCloseMonth(periode)
  const range = { gte: month.start, lte: month.end }

  const [
    settings,
    draftJournals,
    draftSalesInvoices,
    draftVendorBills,
    unfinishedReconciliations,
    unverifiedGoodsReceipts,
    unmatchedStatementLines,
    draftPayrolls,
    negativeStockItems,
  ] = await Promise.all([
    prisma.systemSetting.findFirst({ select: { periodLockDate: true } }),
    prisma.journal.count({ where: { status: "DRAFT", deletedAt: null, transactionDate: range } }),
    prisma.salesInvoice.count({ where: { status: "draft", deletedAt: null, date: range } }),
    prisma.vendorBill.count({ where: { status: "draft", deletedAt: null, date: range } }),
    prisma.bankReconciliation.count({ where: { status: { not: "completed" }, statementDate: range } }),
    prisma.goodsReceipt.count({ where: { status: "draft", date: range } }),
    prisma.bankStatementLine.count({
      where: { status: { not: "matched" }, date: range, bankStatement: { deletedAt: null } },
    }),
    prisma.payroll.count({ where: { status: "draft", startDate: range } }),
    prisma.item.count({ where: { deletedAt: null, isActive: true, qtyOnHand: { lt: 0 } } }),
  ])

  const result = buildPeriodCloseChecks({
    monthLabel: month.label,
    closingDate: month.end,
    currentLockDate: settings?.periodLockDate ?? null,
    counts: {
      draftJournals,
      draftSalesInvoices,
      draftVendorBills,
      unfinishedReconciliations,
      unverifiedGoodsReceipts,
      unmatchedStatementLines,
      draftPayrolls,
      negativeStockItems,
    },
  })

  return { month, result }
}

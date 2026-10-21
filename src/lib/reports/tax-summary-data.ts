/**
 * Pemuatan data laporan pajak (Laporan Pajak PPN, Rekonsiliasi PPN,
 * Bukti Potong PPh) — satu sumber layar & PDF.
 *
 * Aturan status sama dengan halaman: PPN diakui pada faktur/tagihan
 * `posted/partial/paid`; bukti potong pembelian dari tagihan yang dipotong,
 * sisi penjualan dari pembayaran yang dipotong pelanggan.
 */

import { prisma } from "@/lib/db/prisma"
import { rangePeriodLabels } from "@/lib/reports/period-label"
import { buildVatPosition } from "@/lib/reports/vat-reconciliation"
import {
  buildTaxSummaryTotals,
  buildVatReconciliationTotals,
  buildWithholdingTotal,
  taxDocumentBase,
} from "@/lib/reports/tax-summary"
import { getSystemSettings } from "@/lib/utils/settings"
import { REPORT_JOURNAL_STATUSES } from "@/lib/services/report-aggregation.service"
import { formatAccounting } from "@/lib/utils/format"
import { loadSptPeriodRowsForRange, type SptPeriodRow } from "@/lib/reports/spt-read-model-data"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface TaxSimpleReport {
  table: { columns: TableColumn[]; rows: TableRow[] }
  periodLabel: string
  periodCaption: string
}

const money = (value: number) => formatAccounting(value, { zeroDash: false })
const shortDate = (date: Date) =>
  date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })
const periodOf = (period: { start: Date; end: Date }) => rangePeriodLabels(period)

type Period = { start: Date; end: Date }

const TAX_COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 28 },
  { header: "No. Dokumen", align: "left", width: 38 },
  { header: "Pihak", align: "left", width: 60 },
  { header: "DPP", align: "right", width: 40 },
  { header: "PPN", align: "right", width: 36 },
]

export async function loadTaxSummary(period: Period): Promise<TaxSimpleReport> {
  const [salesInvoices, vendorBills] = await Promise.all([
    prisma.salesInvoice.findMany({
      where: {
        date: { gte: period.start, lte: period.end },
        status: { in: ["posted", "partial", "paid"] },
        deletedAt: null,
        taxAmount: { gt: 0 },
      },
      include: { customer: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.vendorBill.findMany({
      where: {
        date: { gte: period.start, lte: period.end },
        status: { in: ["posted", "partial", "paid"] },
        deletedAt: null,
        tax: { gt: 0 },
      },
      include: { vendor: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
  ])
  const rows: TableRow[] = [{ kind: "group", label: "PPN Keluaran" }]
  for (const inv of salesInvoices) {
    rows.push({
      kind: "data",
      cells: [
        shortDate(inv.date),
        inv.documentNo,
        inv.customer.name,
        money(taxDocumentBase(inv.subtotal, inv.discount)),
        money(Number(inv.taxAmount)),
      ],
    })
  }
  const taxTotals = buildTaxSummaryTotals(
    salesInvoices.map((inv) => inv.taxAmount),
    vendorBills.map((bill) => bill.tax),
  )
  const totalOutput = taxTotals.totalOutput
  rows.push({ kind: "total", label: "Jumlah PPN Keluaran", cells: ["", "", "", "", money(totalOutput)] })
  rows.push({ kind: "group", label: "PPN Masukan" })
  for (const bill of vendorBills) {
    rows.push({
      kind: "data",
      cells: [
        shortDate(bill.date),
        bill.documentNo,
        bill.vendor.name,
        money(taxDocumentBase(bill.subtotal, bill.discountAmount ?? 0)),
        money(Number(bill.tax)),
      ],
    })
  }
  const totalInput = taxTotals.totalInput
  rows.push({ kind: "total", label: "Jumlah PPN Masukan", cells: ["", "", "", "", money(totalInput)] })
  rows.push({
    kind: "total",
    grand: true,
    label: taxTotals.kurangBayar ? "PPN Kurang Bayar" : "PPN Lebih Bayar",
    cells: ["", "", "", "", money(Math.abs(taxTotals.difference))],
  })
  return { table: { columns: TAX_COLUMNS, rows }, ...periodOf(period) }
}

const RECON_COLUMNS: TableColumn[] = [
  { header: "Sisi", align: "left", width: 70 },
  { header: "Per Buku", align: "right", width: 44 },
  { header: "Per Dokumen", align: "right", width: 44 },
  { header: "Selisih", align: "right", width: 44 },
]

export async function loadVatReconciliation(period: Period): Promise<TaxSimpleReport> {
  const settings = await getSystemSettings()
  const outputAccountId = settings.salesTaxAccountId ?? null
  const inputAccountId = settings.purchaseTaxAccountId ?? null
  const [outputEntries, inputEntries, salesInvoices, vendorBills] = await Promise.all([
    outputAccountId
      ? prisma.journalEntry.findMany({
          where: {
            accountId: outputAccountId,
            journal: {
              status: { in: [...REPORT_JOURNAL_STATUSES] },
              deletedAt: null,
              transactionDate: { gte: period.start, lte: period.end },
            },
          },
          select: { debit: true, credit: true },
        })
      : Promise.resolve([]),
    inputAccountId
      ? prisma.journalEntry.findMany({
          where: {
            accountId: inputAccountId,
            journal: {
              status: { in: [...REPORT_JOURNAL_STATUSES] },
              deletedAt: null,
              transactionDate: { gte: period.start, lte: period.end },
            },
          },
          select: { debit: true, credit: true },
        })
      : Promise.resolve([]),
    prisma.salesInvoice.findMany({
      where: {
        date: { gte: period.start, lte: period.end },
        status: { in: ["posted", "partial", "paid"] },
        deletedAt: null,
      },
      select: { taxAmount: true },
    }),
    prisma.vendorBill.findMany({
      where: {
        date: { gte: period.start, lte: period.end },
        status: { in: ["posted", "partial", "paid"] },
        deletedAt: null,
      },
      select: { tax: true },
    }),
  ])
  const recon = buildVatReconciliationTotals({
    outputEntries,
    inputEntries,
    docOutputAmounts: salesInvoices.map((inv) => inv.taxAmount),
    docInputAmounts: vendorBills.map((bill) => bill.tax),
  })
  const { bookOutput, bookInput, docOutput, docInput } = recon
  const position = buildVatPosition(bookOutput, bookInput)
  void position
  const rows: TableRow[] = [
    {
      kind: "data",
      cells: ["PPN Keluaran", money(bookOutput), money(docOutput), money(bookOutput - docOutput)],
    },
    {
      kind: "data",
      cells: ["PPN Masukan", money(bookInput), money(docInput), money(bookInput - docInput)],
    },
    {
      kind: "total",
      grand: true,
      label: "Selisih Bersih",
      cells: ["", "", "", money(bookOutput - docOutput - (bookInput - docInput))],
    },
  ]
  if (outputAccountId === null || inputAccountId === null) {
    rows.push({
      kind: "notice",
      text: "Akun PPN Keluaran dan/atau PPN Masukan belum dipetakan di Pengaturan → Mapping Akun, sehingga sisi buku ditampilkan 0.",
    })
  }
  return { table: { columns: RECON_COLUMNS, rows }, ...periodOf(period) }
}

export const SPT_COLUMNS: TableColumn[] = [
  { header: "Masa", align: "left", width: 22 },
  { header: "Sumber", align: "left", width: 34 },
  { header: "PPN Keluaran", align: "right", width: 34 },
  { header: "Pengurang Retur", align: "right", width: 34 },
  { header: "PPN Masukan", align: "right", width: 34 },
  { header: "Neto SPT", align: "right", width: 34 },
  { header: "Per Jurnal", align: "right", width: 34 },
  { header: "Selisih Jurnal–SPT", align: "right", width: 34 },
  { header: "Disetor", align: "right", width: 34 },
  { header: "Sisa", align: "right", width: 34 },
]

const SPT_SOURCE_LABEL: Record<SptPeriodRow["source"], string> = {
  tax_invoice: "Faktur pajak",
  legacy: "Legacy (tanpa faktur)",
  mixed: "Campuran",
}

/**
 * Baris tabel posisi SPT per masa (F-001/F-002/F-004/F-005). Neto per masa =
 * keluaran − pengurang retur − masukan; kewajiban jurnal ditampilkan di
 * samping posisi dokumen dan selisihnya adalah TEMUAN (notice), bukan
 * dipilih diam-diam salah satu. Setor lebih besar dari kewajiban tampil
 * sebagai sisa negatif + notice lebih-bayar.
 */
export function buildSptTableRows(rows: SptPeriodRow[]): TableRow[] {
  const out: TableRow[] = []
  let totalNet = 0
  let hasLegacy = false
  let hasJournalDiff = false
  const overpaidPeriods: string[] = []
  for (const row of rows) {
    totalNet += row.net
    if (row.source !== "tax_invoice") hasLegacy = true
    if (row.journalVsSptDiff != null && Math.abs(row.journalVsSptDiff) > 0.005) hasJournalDiff = true
    if (row.overpaid) overpaidPeriods.push(row.period)
    out.push({
      kind: "data",
      cells: [
        row.period,
        SPT_SOURCE_LABEL[row.source],
        money(row.outputVat),
        money(row.returnVat),
        money(row.inputVat),
        money(row.net),
        row.journalLiability == null ? "-" : money(row.journalLiability),
        row.journalVsSptDiff == null ? "-" : money(row.journalVsSptDiff),
        money(row.paid),
        money(row.balance),
      ],
    })
  }
  if (rows.length === 0) {
    out.push({ kind: "notice", text: "Tidak ada masa pajak pada periode ini." })
    return out
  }
  out.push({
    kind: "total",
    grand: true,
    label: totalNet >= 0 ? "PPN Kurang Bayar (Neto SPT)" : "PPN Lebih Bayar (Neto SPT)",
    cells: ["", "", "", "", "", money(Math.abs(totalNet)), "", "", "", ""],
  })
  if (hasLegacy) {
    out.push({
      kind: "notice",
      text: "Sebagian masa tanpa dokumen TaxInvoice — angka berasal dari dokumen komersial berjalan (legacy) dan belum tentu merupakan faktur pajak.",
    })
  }
  if (hasJournalDiff) {
    out.push({
      kind: "notice",
      text: "Ada selisih kewajiban per jurnal POSTED vs posisi SPT dokumen (kolom Selisih Jurnal–SPT). Selisih adalah temuan rekonsiliasi — periksa sebelum lapor; tidak dipilih diam-diam salah satu.",
    })
  }
  if (overpaidPeriods.length > 0) {
    out.push({
      kind: "notice",
      text: `Penyetoran melebihi kewajiban masa (lebih bayar) pada masa: ${overpaidPeriods.join(", ")}.`,
    })
  }
  return out
}

export async function loadTaxSummarySpt(period: Period): Promise<TaxSimpleReport> {
  const rows = await loadSptPeriodRowsForRange({ start: period.start, end: period.end })
  return { table: { columns: SPT_COLUMNS, rows: buildSptTableRows(rows) }, ...periodOf(period) }
}

const WHT_COLUMNS: TableColumn[] = [
  { header: "Tanggal", align: "left", width: 28 },
  { header: "No. Tagihan", align: "left", width: 38 },
  { header: "Pemasok", align: "left", width: 56 },
  { header: "Jenis PPh", align: "left", width: 28 },
  { header: "DPP", align: "right", width: 38 },
  { header: "PPh Dipotong", align: "right", width: 38 },
]

export async function loadWithholdingSummary(period: Period): Promise<TaxSimpleReport> {
  const bills = await prisma.vendorBill.findMany({
    where: {
      date: { gte: period.start, lte: period.end },
      status: { in: ["posted", "partial", "paid"] },
      deletedAt: null,
      withholdingAmount: { gt: 0 },
    },
    include: {
      vendor: { select: { name: true } },
      withholdingType: { select: { code: true, name: true, rate: true } },
    },
    orderBy: [{ date: "asc" }, { documentNo: "asc" }],
  })
  const rows: TableRow[] = bills.map((bill) => ({
    kind: "data" as const,
    cells: [
      shortDate(bill.date),
      bill.documentNo,
      bill.vendor.name,
      bill.withholdingType?.code ?? "-",
      money(taxDocumentBase(bill.subtotal, bill.discountAmount ?? 0)),
      money(Number(bill.withholdingAmount)),
    ],
  }))
  if (rows.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada bukti potong PPh pada periode ini." })
  } else {
    const total = buildWithholdingTotal(bills.map((b) => b.withholdingAmount))
    rows.push({ kind: "total", grand: true, label: "Jumlah Dipotong", cells: ["", "", "", "", "", money(total)] })
  }
  return { table: { columns: WHT_COLUMNS, rows }, ...periodOf(period) }
}

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
import { getSystemSettings } from "@/lib/utils/settings"
import { REPORT_JOURNAL_STATUSES } from "@/lib/services/report-aggregation.service"
import { formatAccounting } from "@/lib/utils/format"
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
        money(Number(inv.subtotal) - Number(inv.discount)),
        money(Number(inv.taxAmount)),
      ],
    })
  }
  const totalOutput = salesInvoices.reduce((s, inv) => s + Number(inv.taxAmount), 0)
  rows.push({ kind: "total", label: "Jumlah PPN Keluaran", cells: ["", "", "", "", money(totalOutput)] })
  rows.push({ kind: "group", label: "PPN Masukan" })
  for (const bill of vendorBills) {
    rows.push({
      kind: "data",
      cells: [
        shortDate(bill.date),
        bill.documentNo,
        bill.vendor.name,
        money(Number(bill.subtotal) - Number(bill.discountAmount ?? 0)),
        money(Number(bill.tax)),
      ],
    })
  }
  const totalInput = vendorBills.reduce((s, bill) => s + Number(bill.tax), 0)
  rows.push({ kind: "total", label: "Jumlah PPN Masukan", cells: ["", "", "", "", money(totalInput)] })
  rows.push({
    kind: "total",
    grand: true,
    label: totalOutput - totalInput >= 0 ? "PPN Kurang Bayar" : "PPN Lebih Bayar",
    cells: ["", "", "", "", money(Math.abs(totalOutput - totalInput))],
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
  const bookOutput = outputEntries.reduce((s, e) => s + Number(e.credit) - Number(e.debit), 0)
  const bookInput = inputEntries.reduce((s, e) => s + Number(e.debit) - Number(e.credit), 0)
  const docOutput = salesInvoices.reduce((s, inv) => s + Number(inv.taxAmount), 0)
  const docInput = vendorBills.reduce((s, bill) => s + Number(bill.tax), 0)
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
      money(Number(bill.subtotal) - Number(bill.discountAmount ?? 0)),
      money(Number(bill.withholdingAmount)),
    ],
  }))
  if (rows.length === 0) {
    rows.push({ kind: "notice", text: "Tidak ada bukti potong PPh pada periode ini." })
  } else {
    const total = bills.reduce((s, b) => s + Number(b.withholdingAmount), 0)
    rows.push({ kind: "total", grand: true, label: "Jumlah Dipotong", cells: ["", "", "", "", "", money(total)] })
  }
  return { table: { columns: WHT_COLUMNS, rows }, ...periodOf(period) }
}

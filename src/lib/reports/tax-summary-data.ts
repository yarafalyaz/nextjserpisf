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
import { buildVatReconciliationTotals } from "@/lib/reports/tax-summary"
import { buildWithholdingCertificateTable } from "@/lib/reports/withholding-certificates"
import { loadWithholdingCertificateInputs } from "@/lib/reports/withholding-certificates-data"
import { getSystemSettings } from "@/lib/utils/settings"
import { REPORT_JOURNAL_STATUSES } from "@/lib/services/report-aggregation.service"
import { formatAccounting, formatAccountingExact } from "@/lib/utils/format"
import { safeSubtract } from "@/lib/utils/math"
import { loadSptPeriodRowsForRange, type SptPeriodRow } from "@/lib/reports/spt-read-model-data"
import { isValidVendorTaxInvoiceNumber } from "@/lib/tax/tax-invoice"
import { snapshotReturnLine } from "@/lib/tax/return-snapshot"
import type { TableColumn, TableRow } from "@/lib/pdf/engine/types"

export interface TaxSimpleReport {
  table: { columns: TableColumn[]; rows: TableRow[] }
  periodLabel: string
  periodCaption: string
}

/**
 * Nominal SPT per masa dicetak hingga sen bila memang bersen; rupiah penuh bila
 * bulat. Selisih jurnal–SPT 0,29 yang dibulatkan menjadi "0" menyatakan
 * rekonsiliasi cocok padahal ada temuan.
 */
const money = (value: number) => formatAccountingExact(value)
const vatMoney = (value: number) => formatAccounting(value, { zeroDash: false, decimals: 2 })
const periodOf = (period: { start: Date; end: Date }) => rangePeriodLabels(period)

type Period = { start: Date; end: Date }


/**
 * loadTaxSummary warisan (rincian per dokumen) dipensiunkan 2026-10-21:
 * halaman /laporan/pajak dan ekspornya kini murni read-model SPT
 * (`loadTaxSummarySpt`), jadi tidak ada konsumen tersisa. Fungsi DPP
 * vendor bill yang dijaga penjaga `vendor-bill-discount-wiring` hidup
 * di `spt-read-model-data.ts`, bukan di sini.
 */
/**
 * PPN retur penjualan completed pada masa efektif nota retur
 * (`taxReturnNoteDate`, fallback tanggal retur) — basis yang sama dengan
 * pengurang SPT. Query OR memuat kandidat yang salah satu tanggalnya masuk
 * rentang; filter JS memastikan tanggal efektifnya yang dipakai.
 */
export async function loadReturnVatAmounts(period: Period): Promise<number[]> {
  const returns = await prisma.salesReturn.findMany({
    where: {
      status: "completed",
      OR: [
        { date: { gte: period.start, lte: period.end } },
        { taxReturnNoteDate: { gte: period.start, lte: period.end } },
      ],
    },
    select: {
      date: true,
      taxReturnNoteDate: true,
      // qty/price + faktur asal hanya untuk hitung-ulang baris legacy.
      salesInvoice: { select: { subtotal: true, discount: true, taxAmount: true } },
      items: { select: { returnVat: true, qty: true, price: true } },
    },
  })
  return returns
    .filter((ret) => {
      const effective = ret.taxReturnNoteDate ?? ret.date
      return effective.getTime() >= period.start.getTime() && effective.getTime() <= period.end.getTime()
    })
    .flatMap((ret) =>
      ret.items.map((item) => {
        if (item.returnVat != null) return Number(item.returnVat)
        // Baris legacy (tanpa snapshot): hitung-ulang tarif efektif faktur
        // asal; memetakan null ke 0 menghilangkan pengurang dari rekonsiliasi.
        return snapshotReturnLine({
          qty: Number(item.qty ?? 0),
          price: Number(item.price ?? 0),
          source: ret.salesInvoice
            ? {
                subtotal: Number(ret.salesInvoice.subtotal),
                discount: Number(ret.salesInvoice.discount),
                taxAmount: Number(ret.salesInvoice.taxAmount),
              }
            : null,
        }).returnVat
      }),
    )
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
  const [outputEntries, inputEntries, salesInvoices, vendorBills, returnVatAmounts] = await Promise.all([
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
      select: { tax: true, taxInvoiceNumber: true },
    }),
    loadReturnVatAmounts(period),
  ])
  const recon = buildVatReconciliationTotals({
    outputEntries,
    inputEntries,
    docOutputAmounts: salesInvoices.map((inv) => inv.taxAmount),
    docReturnVatAmounts: returnVatAmounts,
    // Bill tax>0 tanpa nomor faktur pajak valid tidak punya kaki PPN
    // Masukan di jurnal (accounting.hook) dan nol di read-model SPT —
    // sisi dokumen harus nol juga, kalau tidak selisih palsu permanen.
    docInputAmounts: vendorBills.map((bill) =>
      Number(bill.tax) > 0 && !isValidVendorTaxInvoiceNumber(bill.taxInvoiceNumber ?? null)
        ? 0
        : bill.tax,
    ),
  })
  const { bookOutput, bookInput, docOutput, docInput } = recon
  const position = buildVatPosition(bookOutput, bookInput)
  void position
  const rows: TableRow[] = [
    {
      kind: "data",
      cells: ["PPN Keluaran", vatMoney(bookOutput), vatMoney(docOutput), vatMoney(safeSubtract(bookOutput, docOutput, 2))],
    },
    {
      kind: "data",
      cells: ["PPN Masukan", vatMoney(bookInput), vatMoney(docInput), vatMoney(safeSubtract(bookInput, docInput, 2))],
    },
    {
      kind: "total",
      grand: true,
      label: "Selisih Bersih",
      cells: [vatMoney(safeSubtract(safeSubtract(bookOutput, docOutput, 2), safeSubtract(bookInput, docInput, 2), 2))],
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
  let hasUnavailableJournalLiability = false
  const overpaidPeriods: string[] = []
  for (const row of rows) {
    totalNet += row.net
    if (row.source !== "tax_invoice") hasLegacy = true
    if (row.journalLiability == null) hasUnavailableJournalLiability = true
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
    cells: [money(Math.abs(totalNet)), "", "", "", ""],
  })
  if (hasLegacy) {
    out.push({
      kind: "notice",
      text: "Sebagian masa tanpa dokumen TaxInvoice — angka berasal dari dokumen komersial berjalan (legacy) dan belum tentu merupakan faktur pajak.",
    })
  }
  if (hasUnavailableJournalLiability) {
    out.push({
      kind: "notice",
      text: "Kewajiban jurnal tidak tersedia untuk sebagian masa; periksa pemetaan akun PPN dan pengaturan sistem sebelum lapor.",
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

/**
 * Bukti Potong PPh untuk PDF — DUA sisi dari loader bersama yang sama
 * dengan layar & CSV (B8). Versi lama hanya memuat sisi vendor
 * (VendorBill), sehingga total PDF tidak pernah sama dengan layar yang
 * menampilkan juga PPh yang dipotong pelanggan.
 */
export async function loadWithholdingSummary(period: Period): Promise<TaxSimpleReport> {
  const inputs = await loadWithholdingCertificateInputs(period)
  const table = buildWithholdingCertificateTable(inputs)
  return { table: { columns: table.columns, rows: table.rows }, ...periodOf(period) }
}

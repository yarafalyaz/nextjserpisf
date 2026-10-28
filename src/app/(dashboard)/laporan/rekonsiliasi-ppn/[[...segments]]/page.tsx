export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatAccounting, formatCurrency, formatDate } from "@/lib/utils/format"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { REPORT_JOURNAL_STATUSES } from "@/lib/services/report-aggregation.service"
import { buildVatPosition, VAT_STATUS_LABELS } from "@/lib/reports/vat-reconciliation"
import { getSystemSettings } from "@/lib/utils/settings"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { ReportLetterhead } from "@/components/reports/report-letterhead"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Rekonsiliasi PPN" }

/**
 * Rekonsiliasi PPN: sisi BUKU (jurnal pada akun PPN) vs sisi DOKUMEN
 * (PPN pada faktur penjualan & tagihan vendor). Selisihnya ditampilkan apa
 * adanya — bukan dipaksa nol — supaya ketidakcocokan langsung terlihat.
 */
export default async function VatReconciliationPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission("view_reports")

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))
  const { start: startDate, end: endDate } = period

  const settings = await getSystemSettings()
  const outputAccountId = settings.salesTaxAccountId ?? null
  const inputAccountId = settings.purchaseTaxAccountId ?? null
  const mappingMissing = outputAccountId === null || inputAccountId === null

  const [outputAccountEntries, inputAccountEntries, salesInvoices, vendorBills] = await Promise.all([
    outputAccountId
      ? prisma.journalEntry.findMany({
          where: {
            accountId: outputAccountId,
            journal: { status: { in: [...REPORT_JOURNAL_STATUSES] }, deletedAt: null, transactionDate: { gte: startDate, lte: endDate } },
          },
          select: { debit: true, credit: true },
        })
      : Promise.resolve([]),
    inputAccountId
      ? prisma.journalEntry.findMany({
          where: {
            accountId: inputAccountId,
            journal: { status: { in: [...REPORT_JOURNAL_STATUSES] }, deletedAt: null, transactionDate: { gte: startDate, lte: endDate } },
          },
          select: { debit: true, credit: true },
        })
      : Promise.resolve([]),
    prisma.salesInvoice.findMany({
      where: { date: { gte: startDate, lte: endDate }, status: { in: ["posted", "partial", "paid"] }, deletedAt: null },
      select: { taxAmount: true },
    }),
    prisma.vendorBill.findMany({
      where: { date: { gte: startDate, lte: endDate }, status: { in: ["posted", "partial", "paid"] }, deletedAt: null },
      select: { tax: true },
    }),
  ])

  // PPN Keluaran akunnya bersaldo kredit, PPN Masukan bersaldo debit.
  const bookOutput = outputAccountEntries.reduce((sum, e) => sum + Number(e.credit) - Number(e.debit), 0)
  const bookInput = inputAccountEntries.reduce((sum, e) => sum + Number(e.debit) - Number(e.credit), 0)
  const docOutput = salesInvoices.reduce((sum, inv) => sum + Number(inv.taxAmount), 0)
  const docInput = vendorBills.reduce((sum, bill) => sum + Number(bill.tax), 0)

  const position = buildVatPosition(bookOutput, bookInput)
  const outputDiff = bookOutput - docOutput
  const inputDiff = bookInput - docInput
  const periodLabel = `Periode ${formatDate(startDate)} – ${formatDate(endDate)}`

  return (
    <ReportPageShell title="Rekonsiliasi PPN" sheet={false} wide filter={<>
<ReportPeriodFilter
        basePath="/laporan/rekonsiliasi-ppn"
        mode="range"
        defaultStartDate={toLocalDateOnly(startDate)}
        defaultEndDate={toLocalDateOnly(endDate)}
      />
</>} actions={<>
<div className="flex items-center justify-end print:hidden"><ExportButtons title="Rekonsiliasi_PPN" pdfHref={buildReportPdfHref("rekonsiliasi-ppn", period.slug)} /></div>
</>}>



      <ReportLetterhead title="Rekonsiliasi PPN" subtitle="Per Buku (Jurnal) vs Per Dokumen" periodLabel={periodLabel} />
      <ReportNarration text="Laporan Rekonsiliasi PPN membandingkan PPN yang tercatat di buku besar (jurnal pada akun PPN) dengan PPN yang tercantum di dokumen (faktur penjualan dan tagihan pemasok). Selisih yang muncul menandakan ada dokumen yang belum dijurnal atau jurnal manual yang tidak punya dokumen — kolom selisih sengaja tidak dinolkan supaya perbedaan itu terlihat." />

      {mappingMissing && (
        <ReportSection title="Peringatan Pemetaan Akun">
          <p className="text-sm text-danger">
            Akun <strong>PPN Keluaran</strong> dan/atau <strong>PPN Masukan</strong> belum dipetakan di Pengaturan → Mapping Akun,
            sehingga sisi buku ditampilkan 0 dan selisihnya belum bermakna.
          </p>
        </ReportSection>
      )}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="PPN Keluaran (Buku)" value={formatCurrency(bookOutput)} />
        <ReportKpiCard label="PPN Masukan (Buku)" value={formatCurrency(bookInput)} />
        <ReportKpiCard
          label={`Posisi: ${VAT_STATUS_LABELS[position.status]}`}
          value={formatCurrency(Math.abs(position.difference))}
          valueClassName={position.status === "kurang_bayar" ? "text-danger" : position.status === "lebih_bayar" ? "text-success" : ""}
        />
      </div>

      <ReportSection title="Rekonsiliasi per Buku vs per Dokumen">
        <DetailTable data-report-table="Rekonsiliasi PPN">
          <DetailTableHead>
            <DetailTableTh>Sisi</DetailTableTh>
            <DetailTableTh align="right">Per Buku (Jurnal)</DetailTableTh>
            <DetailTableTh align="right">Per Dokumen</DetailTableTh>
            <DetailTableTh align="right">Selisih</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            <DetailTableRow>
              <DetailTableTd className="font-medium">PPN Keluaran</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(bookOutput)}</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(docOutput)}</DetailTableTd>
              <DetailTableTd align="right" className={Math.abs(outputDiff) < 0.005 ? "text-success" : "text-danger"}>{formatAccounting(outputDiff)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd className="font-medium">PPN Masukan</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(bookInput)}</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(docInput)}</DetailTableTd>
              <DetailTableTd align="right" className={Math.abs(inputDiff) < 0.005 ? "text-success" : "text-danger"}>{formatAccounting(inputDiff)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow className="font-bold border-t-2 border-default">
              <DetailTableTd>Posisi (Keluaran − Masukan)</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(bookOutput - bookInput)}</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(docOutput - docInput)}</DetailTableTd>
              <DetailTableTd align="right" className="text-danger">{formatAccounting((bookOutput - bookInput) - (docOutput - docInput))}</DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Kesimpulan Posisi">
        <DetailTable data-report-table="Posisi PPN">
          <DetailTableHead>
            <DetailTableTh>Uraian</DetailTableTh>
            <DetailTableTh align="right">Nilai</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            <DetailTableRow>
              <DetailTableTd>PPN Keluaran (buku)</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(position.output)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow>
              <DetailTableTd>PPN Masukan (buku)</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(position.input)}</DetailTableTd>
            </DetailTableRow>
            <DetailTableRow className="font-bold border-t-2 border-default">
              <DetailTableTd>{VAT_STATUS_LABELS[position.status]}</DetailTableTd>
              <DetailTableTd align="right" className={position.status === "kurang_bayar" ? "text-danger" : position.status === "lebih_bayar" ? "text-success" : undefined}>
                {formatAccounting(Math.abs(position.difference))}
              </DetailTableTd>
            </DetailTableRow>
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </ReportPageShell>
  )
}

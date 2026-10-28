export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { formatAccounting, formatCurrency, formatDate, formatNumber } from "@/lib/utils/format"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { CREDIT_EXPOSURE_STATUS_LABEL } from "@/lib/reports/customer-receivables"
import { loadCustomerCreditExposure } from "@/lib/reports/ledger-cash-data"
import { DetailTable, DetailTableHead, DetailTableTh, DetailTableBody, DetailTableRow, DetailTableTd } from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ExportButtons } from "@/components/reports/export-buttons"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportSection, ReportKpiCard } from "@/components/reports/report-section"
import { ReportNarration } from "@/components/reports/report-narration"
import { ReportLetterhead } from "@/components/reports/report-letterhead"

import type { Metadata } from "next"
import { ReportPageShell } from "@/components/reports/report-page-shell"

export const metadata: Metadata = { title: "Piutang per Pelanggan" }

/**
 * Piutang per pelanggan: saldo belum lunas (posisi per akhir periode), umur
 * jatuh tempo, limit & sisa kredit, plus rata-rata hari bayar (DSO) yang
 * dihitung dari pembayaran pada periode terpilih.
 * Angka dari loader bersama ekspor PDF: loadCustomerCreditExposure.
 */
export default async function CustomerReceivablesPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission("view_reports")

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))
  const { start: startDate, end: endDate } = period

  const { rows, totalOutstanding, totalOverdue, totalCreditLimit, totalExposure, totalRemainingCredit, portfolioDso } =
    await loadCustomerCreditExposure({ start: startDate, end: endDate })
  // Baris TOTAL wajib 14 sel sejajar header; total per kolom dihitung dari
  // baris yang sama dengan layar (pola sama dengan ekspor PDF di loader).
  const totalInvoiceCount = rows.reduce((sum, row) => sum + row.invoiceCount, 0)
  const totalOpenOrder = rows.reduce((sum, row) => sum + row.openOrderAmount, 0)
  const totalWoUnrepresented = rows.reduce((sum, row) => sum + (row.woUnrepresented ?? 0), 0)
  const totalConfirmedDp = rows.reduce((sum, row) => sum + (row.confirmedDownPayment ?? 0), 0)
  const totalOpenCredit = rows.reduce((sum, row) => sum + (row.openCustomerCredit ?? 0), 0)
  const periodLabel = `Pembayaran ${formatDate(startDate)} – ${formatDate(endDate)}`

  return (
    <ReportPageShell title="Piutang per Pelanggan" sheet={false} wide filter={<>
<ReportPeriodFilter
        basePath="/laporan/piutang-pelanggan"
        mode="range"
        defaultStartDate={toLocalDateOnly(startDate)}
        defaultEndDate={toLocalDateOnly(endDate)}
      />
</>} actions={<>
<div className="flex items-center justify-end print:hidden"><ExportButtons title="Piutang_per_Pelanggan" pdfHref={buildReportPdfHref("piutang-pelanggan", period.slug)} /></div>
</>}>



      <ReportLetterhead title="Piutang per Pelanggan" subtitle="Umur Piutang, Limit Kredit & Rata-rata Pembayaran" periodLabel={periodLabel} />
      <ReportNarration text="Laporan ini menampilkan saldo piutang belum lunas setiap pelanggan beserta umur jatuh temponya, pemakaian limit kredit, dan rata-rata hari bayar (DSO) yang dihitung dari pembayaran pada periode terpilih. Pelanggan tanpa limit akan menampilkan tanda '–' pada kolom pemakaian karena persentasenya tidak bermakna." />

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Piutang" value={formatCurrency(totalOutstanding)} valueClassName="text-primary" />
        <ReportKpiCard label="Sudah Jatuh Tempo" value={formatCurrency(totalOverdue)} valueClassName="text-danger" />
        <ReportKpiCard label="Total Limit Kredit" value={formatCurrency(totalCreditLimit)} />
        <ReportKpiCard label="Rata-rata Hari Bayar" value={portfolioDso === null ? "–" : `${portfolioDso.toFixed(1)} hari`} />
      </div>

      <ReportSection title={`Piutang per Pelanggan (${rows.length} pelanggan)`}>
        <DetailTable data-report-table="Piutang per Pelanggan">
          <DetailTableHead>
            <DetailTableTh>Pelanggan</DetailTableTh>
            <DetailTableTh align="right">Jumlah Faktur</DetailTableTh>
            <DetailTableTh align="right">Limit Kredit</DetailTableTh>
            <DetailTableTh align="right">Piutang</DetailTableTh>
            <DetailTableTh align="right">Jatuh Tempo</DetailTableTh>
            <DetailTableTh align="right">Sisa Kredit</DetailTableTh>
            <DetailTableTh align="right">Pemakaian</DetailTableTh>
            <DetailTableTh align="right">SO Terbuka</DetailTableTh>
            <DetailTableTh align="right">Job Berjalan</DetailTableTh>
            <DetailTableTh align="right">DP Terkonfirmasi</DetailTableTh>
            <DetailTableTh align="right">Kredit Terbuka</DetailTableTh>
            <DetailTableTh align="right">Paparan Kredit</DetailTableTh>
            <DetailTableTh align="right">Status Kredit</DetailTableTh>
            <DetailTableTh align="right">Rata-rata Bayar (hari)</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {rows.map((row) => (
              <DetailTableRow key={row.customerId}>
                <DetailTableTd className="font-medium">{row.customerName}</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(row.invoiceCount)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.creditLimit)}</DetailTableTd>
                <DetailTableTd align="right" className="font-semibold text-primary">{formatAccounting(row.outstanding)}</DetailTableTd>
                <DetailTableTd align="right" className={row.overdue > 0 ? "text-danger" : undefined}>{formatAccounting(row.overdue)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.remainingCredit)}</DetailTableTd>
                <DetailTableTd align="right" className={row.utilization !== null && row.utilization > 100 ? "text-danger" : undefined}>
                  {row.utilization === null ? "–" : `${row.utilization.toFixed(1)}%`}
                </DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.openOrderAmount)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.woUnrepresented ?? 0)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.confirmedDownPayment ?? 0)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.openCustomerCredit ?? 0)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.exposure)}</DetailTableTd>
                <DetailTableTd align="right">{CREDIT_EXPOSURE_STATUS_LABEL[row.status]}</DetailTableTd>
                <DetailTableTd align="right">{row.avgPaymentDays === null ? "–" : formatNumber(row.avgPaymentDays)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {rows.length === 0 && (
              <DetailTableRow><DetailTableTd colSpan={14} className="text-center text-muted-foreground py-6"><EmptyState title="Tidak ada piutang belum lunas" className="py-0" /></DetailTableTd></DetailTableRow>
            )}
            {rows.length > 0 && (
              <DetailTableRow className="font-bold border-t-2 border-default">
                <DetailTableTd>TOTAL</DetailTableTd>
                <DetailTableTd align="right">{formatNumber(totalInvoiceCount)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalCreditLimit)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalOutstanding)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalOverdue)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalRemainingCredit)}</DetailTableTd>
                <DetailTableTd align="right">
                  {totalCreditLimit > 0 ? `${((totalExposure / totalCreditLimit) * 100).toFixed(1)}%` : "–"}
                </DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalOpenOrder)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalWoUnrepresented)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalConfirmedDp)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalOpenCredit)}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(totalExposure)}</DetailTableTd>
                <DetailTableTd align="right">{""}</DetailTableTd>
                <DetailTableTd align="right">{portfolioDso === null ? "–" : portfolioDso.toFixed(1)}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>
    </ReportPageShell>
  )
}

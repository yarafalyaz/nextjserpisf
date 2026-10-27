export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { formatAccounting, formatDate, formatPercentage, referenceHref } from "@/lib/utils/format"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportKpiCard, ReportSection } from "@/components/reports/report-section"
import {
  DetailTable,
  DetailTableBody,
  DetailTableHead,
  DetailTableRow,
  DetailTableTd,
  DetailTableTh,
} from "@/components/ui/detail-table"
import { EmptyState } from "@/components/ui/empty-state"
import { StatusChip } from "@/components/ui/status-chip"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadDiscountExposureReport } from "@/lib/reports/discount-exposure-export"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import {
  DISCOUNT_EXPOSURE_DOC_TYPE_LABELS,
  DISCOUNT_EXPOSURE_NOTICE_TEXT,
  type DiscountExposureDocType,
} from "@/lib/reports/discount-exposure"

export const metadata: Metadata = { title: "Paparan Diskon Penjualan" }

/** ModelType `referenceHref` per jenis dokumen (format.ts = sumber tunggal rute). */
const DOC_MODEL_TYPES: Record<DiscountExposureDocType, string> = {
  QUOTATION: "Quotation",
  SALES_ORDER: "SalesOrder",
  SALES_INVOICE: "SalesInvoice",
}

/**
 * Laporan Paparan Diskon Penjualan (F-2026-10-25-006-S tahap 1,
 * PUTUSAN LEAD §8A Q-DX-4): halaman laporan baru grup penjualan.
 *
 * Seluruh angka, persen, dan label ditempel apa adanya dari payload
 * loader server (AC-DX-F1 — UI dilarang menghitung ulang); loader
 * menegakkan `view_reports` fail-closed di server (AC-DX-F2/BR-DX-11),
 * ekspor PDF memakai payload yang sama lewat registry.
 */
export default async function DiscountExposurePage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")

  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: now,
  }))

  const { exposure, periodCaption } = await loadDiscountExposureReport(period)

  return (
    <ReportPageShell
      title="Paparan Diskon Penjualan"
      sheetTitle="Paparan Diskon Penjualan"
      subtitle="Diskon Efektif Dokumen Penjualan per Periode"
      periodLabel={periodCaption}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/paparan-diskon-penjualan"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Paparan Diskon Penjualan"
          pdfHref={buildReportPdfHref("paparan-diskon-penjualan", period.slug)}
        />
      }
    >
      <p className="doc-lines">{DISCOUNT_EXPOSURE_NOTICE_TEXT}</p>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard label="Total Dokumen" value={String(exposure.totalDokumen)} />
        <ReportKpiCard label="Total Diskon Efektif" value={formatAccounting(exposure.totalDiskonEfektif, { zeroDash: false })} />
        <ReportKpiCard label="% Efektif Tertimbang" value={formatPercentage(exposure.persenTertimbang, 2)} />
        <ReportKpiCard label="Melebihi Ambang" value={String(exposure.jumlahMelebihiAmbang)} />
      </div>

      <ReportSection title="Ringkasan per Jenis dan Penjual" description="Persen tertimbang nominal dari server">
        <DetailTable data-report-table="Ringkasan Paparan Diskon Penjualan">
          <DetailTableHead>
            <DetailTableTh>Jenis</DetailTableTh>
            <DetailTableTh>Penjual</DetailTableTh>
            <DetailTableTh align="right">Jumlah Dokumen</DetailTableTh>
            <DetailTableTh align="right">Bruto</DetailTableTh>
            <DetailTableTh align="right">Diskon Efektif</DetailTableTh>
            <DetailTableTh align="right">% Tertimbang</DetailTableTh>
            <DetailTableTh align="right">Melebihi Ambang</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {exposure.ringkasan.map((row) => (
              <DetailTableRow key={`${row.docType}-${row.salesEmployeeId ?? "tanpa-penjual"}`}>
                <DetailTableTd>{DISCOUNT_EXPOSURE_DOC_TYPE_LABELS[row.docType]}</DetailTableTd>
                <DetailTableTd>{row.penjualLabel}</DetailTableTd>
                <DetailTableTd align="right">{row.jumlahDokumen}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.totalBruto, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(row.totalDiskonEfektif, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">{formatPercentage(row.persenTertimbang, 2)}</DetailTableTd>
                <DetailTableTd align="right">{row.jumlahMelebihiAmbang}</DetailTableTd>
              </DetailTableRow>
            ))}
            {exposure.ringkasan.length === 0 && (
              <DetailTableRow>
                <DetailTableTd colSpan={7} className="text-center text-muted-foreground py-6">
                  <EmptyState title="Tidak ada dokumen penjualan pada periode ini." className="py-0" />
                </DetailTableTd>
              </DetailTableRow>
            )}
            {exposure.ringkasan.length > 0 && (
              <DetailTableRow className="border-t-2 border-default font-bold">
                <DetailTableTd colSpan={2}>Jumlah</DetailTableTd>
                <DetailTableTd align="right">{exposure.totalDokumen}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(exposure.totalBruto, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(exposure.totalDiskonEfektif, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">{formatPercentage(exposure.persenTertimbang, 2)}</DetailTableTd>
                <DetailTableTd align="right">{exposure.jumlahMelebihiAmbang}</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

      <ReportSection title="Dokumen Penjualan" description="Terurut % efektif tertinggi dari server">
        <DetailTable data-report-table="Paparan Diskon Penjualan">
          <DetailTableHead>
            <DetailTableTh>Tanggal</DetailTableTh>
            <DetailTableTh>No. Dokumen</DetailTableTh>
            <DetailTableTh>Jenis</DetailTableTh>
            <DetailTableTh>Pelanggan</DetailTableTh>
            <DetailTableTh>Penjual</DetailTableTh>
            <DetailTableTh align="right">Bruto</DetailTableTh>
            <DetailTableTh align="right">Diskon Baris</DetailTableTh>
            <DetailTableTh align="right">Diskon Header</DetailTableTh>
            <DetailTableTh align="right">Diskon Efektif</DetailTableTh>
            <DetailTableTh align="right">% Efektif</DetailTableTh>
            <DetailTableTh>Label Ambang</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {exposure.dokumen.map((row) => {
              const href = referenceHref(DOC_MODEL_TYPES[row.docType], row.docId, row.slug)
              return (
                <DetailTableRow key={`${row.docType}-${row.docId}`}>
                  <DetailTableTd>{formatDate(row.date, { format: "short" })}</DetailTableTd>
                  <DetailTableTd className="font-mono text-xs">
                    {href ? (
                      <Link href={href} className="text-primary hover:underline" aria-label={`Lihat dokumen ${row.documentNo}`}>
                        {row.documentNo}
                      </Link>
                    ) : (
                      row.documentNo
                    )}
                  </DetailTableTd>
                  <DetailTableTd>{DISCOUNT_EXPOSURE_DOC_TYPE_LABELS[row.docType]}</DetailTableTd>
                  <DetailTableTd>{row.customerName}</DetailTableTd>
                  <DetailTableTd>{row.penjualLabel}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(row.bruto, { zeroDash: false })}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(row.diskonBaris, { zeroDash: false })}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(row.diskonHeader, { zeroDash: false })}</DetailTableTd>
                  <DetailTableTd align="right">{formatAccounting(row.diskonEfektif, { zeroDash: false })}</DetailTableTd>
                  <DetailTableTd align="right">{formatPercentage(row.persenEfektif, 2)}</DetailTableTd>
                  <DetailTableTd>
                    <StatusChip
                      status={row.labelAmbang}
                      customLabel={row.labelAmbangText}
                      customTone={row.labelAmbang === "MELEBIHI_AMBANG" ? "danger" : row.labelAmbang === "DI_BAWAH_AMBANG" ? "success" : "default"}
                    />
                  </DetailTableTd>
                </DetailTableRow>
              )
            })}
            {exposure.dokumen.length === 0 && (
              <DetailTableRow>
                <DetailTableTd colSpan={11} className="text-center text-muted-foreground py-6">
                  <EmptyState title="Tidak ada dokumen penjualan pada periode ini." className="py-0" />
                </DetailTableTd>
              </DetailTableRow>
            )}
            {exposure.dokumen.length > 0 && (
              <DetailTableRow className="border-t-2 border-default font-bold">
                <DetailTableTd colSpan={5}>Jumlah ({exposure.totalDokumen} dokumen)</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(exposure.totalBruto, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">–</DetailTableTd>
                <DetailTableTd align="right">–</DetailTableTd>
                <DetailTableTd align="right">{formatAccounting(exposure.totalDiskonEfektif, { zeroDash: false })}</DetailTableTd>
                <DetailTableTd align="right">{formatPercentage(exposure.persenTertimbang, 2)}</DetailTableTd>
                <DetailTableTd>{exposure.jumlahMelebihiAmbang} melebihi ambang</DetailTableTd>
              </DetailTableRow>
            )}
          </DetailTableBody>
        </DetailTable>
      </ReportSection>

    </ReportPageShell>
  )
}

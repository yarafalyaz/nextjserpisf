export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency } from "@/lib/utils/format"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadAssetHistory } from "@/lib/reports/asset-reports-data"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Histori Aset Tetap" }

/**
 * Histori aset tetap — garis waktu per aset: perolehan, penyusutan, pelepasan,
 * dan perpindahan lokasi/penanggung jawab.
 *
 * Accurate memisahkannya menjadi Histori Aset, Histori Perubahan Aset, dan
 * Histori Lokasi Aset; di sini satu halaman dengan blok per aset supaya
 * sebab-akibatnya tetap terlihat (aset yang disusutkan dan berpindah lokasi pada
 * hari yang sama adalah satu kejadian, bukan tiga laporan terpisah).
 */
export default async function AssetHistoryPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")

  // Periode dibaca hanya via helper bersama supaya tautan lama
  // ?tanggalMulai=&tanggalSelesai= tetap menampilkan periode yang diminta.
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))

  const { history, periodLabel, periodCaption } = await loadAssetHistory(period)

  return (
    <ReportPageShell
      title="Histori Aset Tetap"
      sheetTitle="Histori Aset Tetap"
      subtitle="Perolehan, Penyusutan, Pelepasan & Perpindahan"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/histori-aset"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Histori Aset Tetap"
          pdfHref={buildReportPdfHref("histori-aset", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={history.table.columns}
        rows={history.table.rows}
        tableLabel="Histori Aset Tetap"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {history.assetCount} aset bergerak pada periode ini ({history.eventCount} kejadian): perolehan{" "}
        {formatCurrency(history.totals.acquisition)} · penyusutan{" "}
        {formatCurrency(history.totals.depreciation)} · pelepasan{" "}
        {formatCurrency(history.totals.disposal)} · perpindahan lokasi {history.totals.transfers} kali.
      </p>
    </ReportPageShell>
  )
}

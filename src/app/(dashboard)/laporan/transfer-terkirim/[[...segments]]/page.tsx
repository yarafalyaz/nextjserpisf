export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { transferInTransitSummary } from "@/lib/reports/transfer-in-transit"
import { loadTransferInTransit } from "@/lib/reports/transfer-in-transit-data"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { formatCurrency } from "@/lib/utils/format"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"

export const metadata: Metadata = { title: "Persediaan Terkirim Belum Diterima" }

export default async function TransferInTransitPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))

  const { report, periodLabel, periodCaption } = await loadTransferInTransit(period)

  return (
    <ReportPageShell
      title="Persediaan Terkirim Belum Diterima"
      sheetTitle="Persediaan Terkirim Belum Diterima (Pemindahan Barang)"
      subtitle="Pemeriksaan: Barang yang Masih di Jalan Antar Gudang"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/transfer-terkirim"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Persediaan Terkirim Belum Diterima"
          pdfHref={buildReportPdfHref("transfer-terkirim", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={report.table.columns}
        rows={report.table.rows}
        tableLabel="Persediaan Terkirim Belum Diterima"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {transferInTransitSummary(report)} · umur:{" "}
        {report.aging
          .filter((bucket) => bucket.value > 0)
          .map((bucket) => `${bucket.label} ${formatCurrency(bucket.value)}`)
          .join(" · ") || "tidak ada"}
      </p>
    </ReportPageShell>
  )
}

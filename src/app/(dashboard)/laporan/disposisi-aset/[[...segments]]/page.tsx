export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency } from "@/lib/utils/format"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { parseReportPeriod } from "@/lib/reports/report-period"
import { loadAssetDisposals } from "@/lib/reports/asset-reports-data"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Daftar Disposisi Aset" }

export default async function AssetDisposalPage({
  params: routeParams,
}: {
  params: Promise<{ segments?: string[] }>
}) {
  const user = await requirePermission("view_reports")
  const params = await routeParams

  const now = new Date()
  const period = parseReportPeriod(params.segments?.[0], {
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  })

  // Baris tabel disusun sekali di sini dan dipakai bersama layar + engine PDF.
  const { disposal, periodLabel, periodCaption } = await loadAssetDisposals(period)

  return (
    <ReportPageShell
      title="Daftar Disposisi Aset"
      sheetTitle="Daftar Disposisi Aset"
      subtitle="Aset yang Dilepas per Periode"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/disposisi-aset"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Daftar Disposisi Aset"
          pdfHref={buildReportPdfHref("disposisi-aset", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={disposal.table.columns}
        rows={disposal.table.rows}
        tableLabel="Daftar Disposisi Aset"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {disposal.count} aset dilepas — harga perolehan {formatCurrency(disposal.totals.cost)}, nilai buku{" "}
        {formatCurrency(disposal.totals.bookValue)}, hasil penjualan{" "}
        {formatCurrency(disposal.totals.proceeds)}, laba/(rugi){" "}
        {formatCurrency(disposal.totals.gainLoss)}.
      </p>
    </ReportPageShell>
  )
}

export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { parseReportPeriod } from "@/lib/reports/report-period"
import { loadStockCount } from "@/lib/reports/stock-count-data"
import { stockCountSummary } from "@/lib/reports/stock-count"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Lembar Penghitungan Stok" }

/**
 * Lembar penghitungan stok — hasil opname per dokumen: kuantitas menurut sistem,
 * hasil hitung fisik, selisih, dan nilainya.
 *
 * Kuantitas tidak bertotal lintas baris (satuan bisa berbeda); hanya nilai
 * selisih yang dijumlahkan. Lihat `stock-count.ts`.
 */
export default async function StockCountPage({
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

  const { count, periodLabel, periodCaption } = await loadStockCount(period)

  return (
    <ReportPageShell
      title="Lembar Penghitungan Stok"
      sheetTitle="Lembar Penghitungan Stok"
      subtitle="Hasil Stok Opname per Dokumen"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/penghitungan-stok"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Lembar Penghitungan Stok"
          pdfHref={buildReportPdfHref("penghitungan-stok", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={count.table.columns}
        rows={count.table.rows}
        tableLabel="Lembar Penghitungan Stok"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {stockCountSummary(count)} · selisih dihitung dari hasil hitung − sistem; nilai memakai harga satuan
        pada lembar.
      </p>
    </ReportPageShell>
  )
}

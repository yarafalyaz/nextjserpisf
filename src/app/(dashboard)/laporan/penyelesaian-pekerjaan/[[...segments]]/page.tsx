export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { parseReportPeriod } from "@/lib/reports/report-period"
import { loadJobOrderCompletion } from "@/lib/reports/job-order-data"
import { jobOrderCompletionSummary } from "@/lib/reports/job-order-completion"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Penyelesaian Pesanan" }

/**
 * Penyelesaian pesanan per bulan — barang jadi yang keluar dari tiap pekerjaan
 * beserta biaya satuannya, ditelusuri dari genealogi produksi.
 */
export default async function JobOrderCompletionPage({
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

  const { completion, periodLabel, periodCaption } = await loadJobOrderCompletion(period)

  return (
    <ReportPageShell
      title="Penyelesaian Pesanan"
      sheetTitle="Penyelesaian Pesanan"
      subtitle="Barang Jadi & Biaya per Unit"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/penyelesaian-pekerjaan"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Penyelesaian Pesanan"
          pdfHref={buildReportPdfHref("penyelesaian-pekerjaan", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={completion.table.columns}
        rows={completion.table.rows}
        tableLabel="Penyelesaian Pesanan"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {jobOrderCompletionSummary(completion)}. Satu baris = satu dokumen penyelesaian, jadi
        pekerjaan yang diselesaikan sebagian muncul beberapa kali.
      </p>
    </ReportPageShell>
  )
}

export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { receivedNotBilledSummary } from "@/lib/reports/received-not-billed"
import { loadReceivedNotBilled } from "@/lib/reports/received-not-billed-data"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { formatCurrency } from "@/lib/utils/format"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"

export const metadata: Metadata = { title: "Barang Diterima Belum Ditagih" }

export default async function ReceivedNotBilledPage({
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

  const { report, periodLabel, periodCaption } = await loadReceivedNotBilled(period)

  return (
    <ReportPageShell
      title="Barang Diterima Belum Ditagih"
      sheetTitle="Barang Diterima Belum Ditagih (GR/IR)"
      subtitle="Pemeriksaan: Sisa Penerimaan vs Akun GRNI"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/penerimaan-belum-ditagih"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Barang Diterima Belum Ditagih"
          pdfHref={buildReportPdfHref("penerimaan-belum-ditagih", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={report.detail.columns}
        rows={report.detail.rows}
        tableLabel="Barang Diterima Belum Ditagih"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {receivedNotBilledSummary(report)} · umur sisa:{" "}
        {report.aging
          .filter((bucket) => bucket.value > 0)
          .map((bucket) => `${bucket.label} ${formatCurrency(bucket.value)}`)
          .join(" · ") || "tidak ada sisa"}
      </p>
    </ReportPageShell>
  )
}

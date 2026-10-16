export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadPurchaseProcessHistory } from "@/lib/reports/purchase-process-history-data"
import { purchaseProcessSummary } from "@/lib/reports/purchase-process-history"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Histori Proses Pembelian" }

export default async function PurchaseProcessHistoryPage({
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

  const { result, periodLabel, periodCaption } = await loadPurchaseProcessHistory(period)

  return (
    <ReportPageShell
      title="Histori Proses Pembelian"
      sheetTitle="Histori Proses Pembelian"
      subtitle="Permintaan → Pesanan → Penerimaan → Tagihan → Pembayaran"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/histori-pembelian"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Histori Proses Pembelian"
          pdfHref={buildReportPdfHref("histori-pembelian", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={result.table.columns}
        rows={result.table.rows}
        tableLabel="Histori Proses Pembelian"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {purchaseProcessSummary(result)}
      </p>
    </ReportPageShell>
  )
}

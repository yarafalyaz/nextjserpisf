export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { orderFulfillmentSummary } from "@/lib/reports/order-fulfillment"
import { loadOrderFulfillment } from "@/lib/reports/order-fulfillment-data"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"

export const metadata: Metadata = { title: "Pemenuhan Pesanan" }

export default async function OrderFulfillmentPage({
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

  const { fulfillment, periodLabel, periodCaption } = await loadOrderFulfillment(period)

  return (
    <ReportPageShell
      title="Pemenuhan Pesanan"
      sheetTitle="Pemenuhan Pesanan"
      subtitle="Pesanan Penjualan yang Belum Terkirim Penuh"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/pemenuhan-pesanan"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Pemenuhan Pesanan"
          pdfHref={buildReportPdfHref("pemenuhan-pesanan", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={fulfillment.table.columns}
        rows={fulfillment.table.rows}
        tableLabel="Pemenuhan Pesanan"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {orderFulfillmentSummary(fulfillment)} · hanya pesanan berstatus confirmed/processing/completed
        yang dihitung, dan hanya surat jalan yang sudah jalan (shipped/delivered) yang mengurangi sisa.
      </p>
    </ReportPageShell>
  )
}

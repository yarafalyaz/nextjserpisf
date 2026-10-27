export const dynamic = "force-dynamic"

import type { Metadata } from "next"
import Link from "next/link"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { minStockSummary } from "@/lib/reports/min-stock"
import { MinStockWarehouseCard } from "@/components/reports/min-stock-warehouse-card"
import { buildMinStockRequestHref } from "@/lib/reports/min-stock-request"
import { loadMinStock } from "@/lib/reports/min-stock-data"
import { loadReorderPoints } from "@/lib/reports/reorder-point-data"
import { ReorderPointCard } from "@/components/reports/reorder-point-card"
import { formatDate } from "@/lib/utils/format"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"

export const metadata: Metadata = { title: "Barang Stok Minimum" }

export default async function MinStockPage({
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

  const { report, warehouseShortages, warehouseNote, periodLabel, periodCaption } =
    await loadMinStock(period)
  const reorderPointReport = await loadReorderPoints()
  const requestHref = buildMinStockRequestHref(report.shortageLines)
  const canCreateRequest =
    requestHref !== null &&
    (user.roles.includes("super_admin") ||
      user.permissions.includes("create_purchase_requests"))

  return (
    <ReportPageShell
      title="Barang Stok Minimum"
      sheetTitle="Barang Stok Minimum"
      subtitle="Barang yang Sudah Mencapai Batas Minimum"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/stok-minimum"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <div className="flex items-center gap-2">
          {canCreateRequest && requestHref ? (
            <Link
              href={requestHref}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:bg-primary-hover hover:shadow-md"
            >
              Buat Permintaan
            </Link>
          ) : null}
          <ExportButtons
            title="Barang Stok Minimum"
            pdfHref={buildReportPdfHref("stok-minimum", period.slug)}
          />
        </div>
      }
    >
      <ReportTableView
        columns={report.table.columns}
        rows={report.table.rows}
        tableLabel="Barang Stok Minimum"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {minStockSummary(report)}
      </p>
      {warehouseShortages.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <MinStockWarehouseCard shortages={warehouseShortages} note={warehouseNote} />
        </div>
      ) : null}
      <div style={{ marginTop: 16 }}>
        <ReorderPointCard
          result={reorderPointReport.result}
          usageWindowDays={reorderPointReport.usageWindowDays}
          usageWindowStartLabel={formatDate(reorderPointReport.usageWindowStart)}
        />
      </div>
    </ReportPageShell>
  )
}

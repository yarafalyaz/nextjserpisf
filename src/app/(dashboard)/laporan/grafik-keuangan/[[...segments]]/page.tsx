export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { FinancialTrendChart } from "@/components/lazy/financial-trend-chart"
import { reportPeriodFromRoute, splitReportSegments } from "@/lib/reports/report-period"
import { loadFinancialMetrics } from "@/lib/reports/financial-charts-data"
import {
  FINANCIAL_CHARTS,
  FINANCIAL_CHART_LABEL,
  buildFinancialTrend,
  buildFinancialTrendTable,
  type FinancialChart,
} from "@/lib/reports/financial-charts"

export const metadata: Metadata = { title: "Grafik Keuangan" }

function parseChart(raw: string | undefined): FinancialChart {
  return (FINANCIAL_CHARTS as readonly string[]).includes(raw ?? "") ? (raw as FinancialChart) : "pendapatan-vs-biaya"
}

export default async function FinancialChartsPage({
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

  const [{ segments = [] }] = await Promise.all([routeParams])
  const { filters } = splitReportSegments(segments)
  const chart = parseChart(filters.grafik)

  const { metrics, periodLabel, periodCaption } = await loadFinancialMetrics(period)
  const trend = buildFinancialTrend(metrics, chart)
  const table = buildFinancialTrendTable(trend)

  return (
    <ReportPageShell
      title="Grafik Keuangan"
      sheetTitle="Grafik Keuangan"
      subtitle={FINANCIAL_CHART_LABEL[chart]}
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/grafik-keuangan"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
          selects={[
            {
              param: "grafik",
              label: "Grafik",
              placeholder: "Pendapatan vs Biaya",
              value: chart,
              options: FINANCIAL_CHARTS.map((value) => ({ value, label: FINANCIAL_CHART_LABEL[value] })),
            },
          ]}
        />
      }
      actions={<ExportButtons title={`Grafik Keuangan - ${FINANCIAL_CHART_LABEL[chart]}`} />}
    >
      <FinancialTrendChart
        data={trend.data}
        series={trend.series}
        kind={trend.kind}
        unit={trend.unit}
        ariaLabel={`Grafik ${FINANCIAL_CHART_LABEL[chart]} ${periodLabel}`}
      />
      <p className="doc-lines" style={{ margin: "8px 0" }}>
        {trend.verdict}
      </p>
      <ReportTableView columns={table.columns} rows={table.rows} tableLabel={`Grafik Keuangan - ${FINANCIAL_CHART_LABEL[chart]}`} />
    </ReportPageShell>
  )
}

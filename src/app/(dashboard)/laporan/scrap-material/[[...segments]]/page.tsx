export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { prisma } from "@/lib/db/prisma"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import {
  reportPeriodFromRoute,
  formatPeriodLabel,
} from "@/lib/reports/report-period"
import { loadScrapMaterialReport } from "@/lib/reports/scrap-material-data"
import {
  buildScrapMaterialTable,
  scrapMaterialSummary,
} from "@/lib/reports/scrap-material"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Scrap Material" }

/**
 * Laporan scrap/yield per baris issue (F-2026-10-21-008). Angka dari loader
 * BOT 3 apa adanya; UI tidak hitung ulang. Flag dari SystemSetting dibaca
 * langsung (kontrak loader tidak membawanya).
 */
export default async function ScrapMaterialPage({
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

  const [{ report }, setting] = await Promise.all([
    loadScrapMaterialReport(period.start, period.end),
    prisma.systemSetting.findFirst({ select: { abnormalScrapPostingEnabled: true } }),
  ])
  const postingEnabled = setting?.abnormalScrapPostingEnabled ?? false
  const table = buildScrapMaterialTable(report)

  return (
    <ReportPageShell
      title="Scrap Material"
      sheetTitle="Scrap Material"
      subtitle="Scrap per Baris Issue — Normal vs Abnormal"
      periodLabel={formatPeriodLabel(period)}
      periodCaption={formatPeriodLabel(period)}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/scrap-material"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Scrap Material"
          pdfHref={buildReportPdfHref("scrap-material", period.slug)}
        />
      }
    >
      <ReportTableView columns={table.columns} rows={table.rows} tableLabel="Scrap Material" />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {scrapMaterialSummary(report, postingEnabled)}
      </p>
    </ReportPageShell>
  )
}

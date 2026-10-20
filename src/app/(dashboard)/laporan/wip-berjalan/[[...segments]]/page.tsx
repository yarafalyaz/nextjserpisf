export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadWipAgingReport } from "@/lib/reports/wip-aging-export"
import { WipAgingCard } from "@/components/reports/wip-aging-card"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Umur WIP Berjalan" }

/**
 * F-2026-10-20-72 (tahap frontend): umur WIP per order produksi berjalan.
 * Snapshot per tanggal akhir periode dari builder read-only `getWipAging`
 * (PR #238): sisa WIP = totalActualCost − releasedCost, ember umur
 * 0-30/31-60/61-90/>90 hari. UI tidak menghitung ulang sisa/umur.
 */
export default async function WipAgingPage({
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

  const { report, periodCaption, asOf } = await loadWipAgingReport(period)

  return (
    <ReportPageShell
      title="Umur WIP Berjalan"
      sheetTitle="Umur WIP Berjalan"
      subtitle="Sisa Biaya WIP per Order Produksi Berjalan dan Ember Umurnya"
      periodLabel={periodCaption}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/wip-berjalan"
          mode="as-of"
          defaultStartDate={toLocalDateOnly(asOf)}
        />
      }
      actions={
        <ExportButtons
          title="Umur WIP Berjalan"
          pdfHref={buildReportPdfHref("wip-berjalan", period.slug)}
        />
      }
    >
      <WipAgingCard aging={report} />
    </ReportPageShell>
  )
}

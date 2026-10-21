export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { VehicleMarginCard } from "@/components/reports/vehicle-margin-card"
import { requirePermission } from "@/lib/auth/permissions"
import { loadVehicleMarginReport } from "@/lib/reports/vehicle-margin-data"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { toLocalDateOnly } from "@/lib/utils/date-only"

export const metadata: Metadata = { title: "Margin Job Kendaraan" }

export default async function VehicleMarginPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  await requirePermission("view_reports")

  const { start: startDate, end: endDate } = await reportPeriodFromRoute(
    routeParams,
    searchParams,
    (now) => ({
      start: new Date(now.getFullYear(), 0, 1),
      end: now,
    }),
  )
  endDate.setHours(23, 59, 59, 999)

  const report = await loadVehicleMarginReport({ start: startDate, end: endDate })

  return (
    <ReportPageShell
      title="Margin Job Kendaraan"
      sheetTitle="Margin Job Kendaraan"
      subtitle="Ringkasan margin job per kendaraan — bukan laba akuntansi"
      periodLabel={report.periodLabel}
      periodCaption={report.periodCaption}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/margin-kendaraan"
          mode="range"
          defaultStartDate={toLocalDateOnly(startDate)}
          defaultEndDate={toLocalDateOnly(endDate)}
        />
      }
      actions={<ExportButtons title="Margin_job_kendaraan" />}
    >
      <VehicleMarginCard report={report} />
    </ReportPageShell>
  )
}

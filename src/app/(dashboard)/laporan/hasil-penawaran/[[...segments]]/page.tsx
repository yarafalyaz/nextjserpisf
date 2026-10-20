export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadQuotationOutcomeReport } from "@/lib/reports/quotation-outcome-export"
import { QuotationOutcomeCard } from "@/components/reports/quotation-outcome-card"
import { buildReportPdfHref } from "@/lib/reports/report-export"

export const metadata: Metadata = { title: "Hasil Penawaran" }

/**
 * F-2026-10-20-101 (tahap laporan): ringkasan menang/kalah/konversi
 * penawaran per periode dari builder read-only `buildQuotationOutcomeSummary`
 * (PR #258 + validasi server PR #261). UI tidak menghitung ulang tingkat;
 * penolakan lama tanpa awalan terstruktur tampil sebagai tak-tercatat.
 */
export default async function QuotationOutcomePage({
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

  const { report, periodCaption } = await loadQuotationOutcomeReport(period)

  return (
    <ReportPageShell
      title="Hasil Penawaran"
      sheetTitle="Hasil Penawaran"
      subtitle="Ringkasan Menang, Kalah, dan Konversi Penawaran"
      periodLabel={periodCaption}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/hasil-penawaran"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Hasil Penawaran"
          pdfHref={buildReportPdfHref("hasil-penawaran", period.slug)}
        />
      }
    >
      <QuotationOutcomeCard summary={report} />
    </ReportPageShell>
  )
}

export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { bankTransactionSummary } from "@/lib/reports/bank-transaction-reconciliation"
import { loadBankTransactionReconciliation } from "@/lib/reports/bank-transaction-reconciliation-data"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"

export const metadata: Metadata = { title: "Transaksi Bank Terekonsiliasi vs Belum" }

export default async function BankTransactionReconciliationPage({
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

  const { report, periodLabel, periodCaption } = await loadBankTransactionReconciliation(period)

  return (
    <ReportPageShell
      title="Transaksi Bank Terekonsiliasi vs Belum"
      sheetTitle="Transaksi Bank Terekonsiliasi vs Belum"
      subtitle="Rekening Koran Dibanding Buku"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/transaksi-bank"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Transaksi Bank Terekonsiliasi vs Belum"
          pdfHref={buildReportPdfHref("transaksi-bank", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={report.table.columns}
        rows={report.table.rows}
        tableLabel="Transaksi Bank Terekonsiliasi vs Belum"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {bankTransactionSummary(report)}
      </p>
    </ReportPageShell>
  )
}

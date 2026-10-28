export const dynamic = "force-dynamic"

import { formatDate } from "@/lib/utils/format"
import type { Metadata } from "next"

import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { SalesCommissionCard } from "@/components/reports/sales-commission-card"
import { SalesCommissionSubledgerCard } from "@/components/reports/sales-commission-subledger-card"
import { requirePermission } from "@/lib/auth/permissions"
import { getSalesCommissionRecap } from "@/lib/reports/sales-commission-data"
import { getSalesCommissionSubledgerRecap } from "@/lib/reports/sales-commission-subledger-data"
import { parseReportFilters } from "@/lib/reports/report-href"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { toLocalDateOnly } from "@/lib/utils/date-only"

export const metadata: Metadata = { title: "Rekap Komisi Penjualan" }

export default async function SalesCommissionPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ tanggalMulai?: string; tanggalSelesai?: string; penjual?: string }>
}) {
  await requirePermission("view_reports")

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const { start: startDate, end: endDate } = await reportPeriodFromRoute(
    routeParams,
    searchParams,
    (now) => ({
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: now,
    }),
  )
  endDate.setHours(23, 59, 59, 999)

  const report = await getSalesCommissionRecap({ start: startDate, end: endDate })
  // Subledger per penerima (049-S): loader server fail-closed view_reports;
  // saldo/status/notice verbatim server, halaman tidak menurunkan apa pun.
  const subledger = await getSalesCommissionSubledgerRecap()

  // Filter penjual = tampil-saja dari rows loader (BR-KOM-04): bukan
  // parameter loader, bukan hitung ulang. Id tak dikenal -> semua.
  const penjualParam = parseReportFilters(segments.slice(1)).penjual ?? search.penjual
  const selectedId = penjualParam ? Number(penjualParam) : null
  const selectedSalesEmployeeId =
    selectedId !== null && report.rows.some((row) => row.salesEmployeeId === selectedId)
      ? selectedId
      : null

  const periodLabel = `Periode ${formatDate(startDate)} – ${formatDate(endDate)}`

  return (
    <ReportPageShell
      title="Rekap Komisi Penjualan"
      sheetTitle="Rekap Komisi Penjualan"
      periodLabel={periodLabel}
      periodCaption={periodLabel}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/rekap-komisi"
          mode="range"
          defaultStartDate={toLocalDateOnly(startDate)}
          defaultEndDate={toLocalDateOnly(endDate)}
          selects={[
            {
              param: "penjual",
              label: "Penjual",
              placeholder: "Semua penjual",
              value: selectedSalesEmployeeId !== null ? String(selectedSalesEmployeeId) : "",
              options: report.rows.map((row) => ({
                value: String(row.salesEmployeeId),
                label: row.salesEmployeeName || "—",
              })),
            },
          ]}
        />
      }
      actions={<ExportButtons title="Rekap_Komisi_Penjualan" />}
    >
      <SalesCommissionCard report={report} selectedSalesEmployeeId={selectedSalesEmployeeId} />
      <SalesCommissionSubledgerCard
        payable={subledger.payable}
        lineStatuses={subledger.lineStatuses}
        selectedSalesEmployeeId={selectedSalesEmployeeId}
      />
    </ReportPageShell>
  )
}

export const dynamic = "force-dynamic"

import { prisma } from "@/lib/db/prisma"
import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency } from "@/lib/utils/format"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { StatementTableView } from "@/components/reports/statement-table-view"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { loadIncomeStatementByCostCenter } from "@/lib/reports/statement-data"
import { reportPeriodFromRoute, splitReportSegments } from "@/lib/reports/report-period"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Laba Rugi per Pusat Biaya" }

export default async function PnLByCostCenterPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ costCenterId?: string; tanggalMulai?: string; tanggalSelesai?: string }>
}) {
  const user = await requirePermission("view_reports")

  const [{ segments = [] }, search] = await Promise.all([routeParams, searchParams])
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))
  const { start: startDate, end: endDate } = period
  // Pusat biaya dari path (slug lebih dulu, id sebagai cadangan); `?costCenterId=`
  // lama tetap dibaca supaya tautan sebelum perpindahan tidak jadi tautan mati.
  const costCenterKey = splitReportSegments(segments).filters["pusat-biaya"] ?? search.costCenterId ?? null

  const costCenters = await prisma.costCenter.findMany({
    where: { isActive: true },
    select: { id: true, code: true, name: true, slug: true },
    orderBy: { code: "asc" },
  })

  const costCenterRow = costCenterKey
    ? costCenters.find((cc) => cc.slug === costCenterKey) ?? costCenters.find((cc) => String(cc.id) === costCenterKey) ?? null
    : null
  const costCenterId = costCenterRow?.id ?? null

  // Baris tabel disusun sekali di sini dan dipakai bersama layar + engine PDF.
  const report = await loadIncomeStatementByCostCenter({ costCenterId, start: startDate, end: endDate })

  const periodSlug = period.slug

  return (
    <ReportPageShell
      title="Laba Rugi per Pusat Biaya"
      sheetTitle={report.costCenterLabel ? `Laba Rugi: ${report.costCenterLabel}` : "Laba Rugi per Pusat Biaya"}
      subtitle="Laba Rugi Multi Tahap"
      periodLabel={report.periodLabel}
      periodCaption={report.periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/laba-rugi-per-pusat-biaya"
          mode="range"
          defaultStartDate={toLocalDateOnly(startDate)}
          defaultEndDate={toLocalDateOnly(endDate)}
          selects={[
            {
              param: "pusat-biaya",
              label: "Pusat Biaya",
              placeholder: "Cari pusat biaya (kode / nama)...",
              value: costCenterRow ? (costCenterRow.slug ?? String(costCenterRow.id)) : "",
              options: costCenters.map((cc) => ({ value: cc.slug ?? String(cc.id), label: `${cc.code} — ${cc.name}` })),
            },
          ]}
        />
      }
      actions={
        // Tanpa pusat biaya tidak ada yang bisa diekspor; tombolnya tidak ditampilkan.
        costCenterId ? (
          <ExportButtons
            title="Laba Rugi per Pusat Biaya"
            pdfHref={buildReportPdfHref("laba-rugi-pusat-biaya", periodSlug, {
              costCenterId: String(costCenterId),
              tanggalMulai: toLocalDateOnly(startDate),
              tanggalSelesai: toLocalDateOnly(endDate),
            })}
          />
        ) : undefined
      }
    >
      <StatementTableView table={report.table} tableLabel="Laba Rugi per Pusat Biaya" />
      {costCenterId ? (
        <p className="doc-lines" style={{ marginTop: 8 }}>
          Ringkasan {report.costCenterLabel}: pendapatan {formatCurrency(report.totals.totalRevenue)}, laba kotor{" "}
          {formatCurrency(report.totals.grossProfit)}, beban operasional{" "}
          {formatCurrency(report.totals.totalExpense)}, laba bersih{" "}
          {formatCurrency(report.totals.netProfit)} (margin {report.totals.margin.toFixed(1)}%).
        </p>
      ) : null}
    </ReportPageShell>
  )
}

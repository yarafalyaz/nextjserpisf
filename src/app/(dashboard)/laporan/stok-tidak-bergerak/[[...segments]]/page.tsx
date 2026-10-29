export const dynamic = "force-dynamic"

import type { Metadata } from "next"

import { requirePermission } from "@/lib/auth/permissions"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportLetterhead } from "@/components/reports/report-letterhead"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportKpiCard } from "@/components/reports/report-section"
import { ReportTableView } from "@/components/reports/report-table-view"
import { buildReportPdfHref } from "@/lib/reports/report-export"
import { buildReportPeriodSlug, splitReportSegments } from "@/lib/reports/report-period"
import { slowMovingSummary } from "@/lib/reports/slow-moving-stock"
import { loadSlowMovingStock } from "@/lib/reports/slow-moving-stock-data"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
export const metadata: Metadata = { title: "Stok Tidak Bergerak" }

/**
 * Laporan pemeriksaan stok tidak bergerak (slow-moving): barang bersisa
 * tanpa pergerakan keluar posted selama ambang hari. Semua angka, baris,
 * dan putusan berasal dari loader/builder `slow-moving-stock` — halaman
 * ini hanya menampilkan, tidak menghitung ulang. Kontrak builder agregat
 * per barang (semua gudang), jadi tidak ada kolom gudang per baris.
 */
export default async function SlowMovingStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<{ ambang?: string }>
}) {
  const user = await requirePermission("view_reports")
  const [{ segments = [] }, search] = await Promise.all([params, searchParams])
  // Ambang tinggal di path (`/ambang/30`) — filter menitip lewat buildReportHref;
  // `?ambang=` lama tetap dibaca sebagai fallback.
  const rawThreshold = splitReportSegments(segments).filters.ambang ?? search.ambang
  const parsedThreshold =
    rawThreshold && /^\d+$/.test(rawThreshold) ? Number(rawThreshold) : null
  const thresholdDays =
    parsedThreshold !== null && parsedThreshold >= 1 && parsedThreshold <= 3650
      ? parsedThreshold
      : undefined

  const asOf = new Date()
  const { report, periodLabel, thresholdDays: appliedThreshold } =
    await loadSlowMovingStock({ asOf, thresholdDays })

  return (
    <ReportPageShell
      title="Stok Tidak Bergerak"
      sheet={false}
      wide
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/stok-tidak-bergerak"
          mode="none"
          defaultStartDate=""
          numberField={{
            param: "ambang",
            label: "Ambang Hari",
            value: String(appliedThreshold),
            min: 1,
            max: 3650,
          }}
        />
      }
      actions={
        <ExportButtons
          title="Stok_Tidak_Bergerak"
          pdfHref={buildReportPdfHref(
            "stok-tidak-bergerak",
            buildReportPeriodSlug(asOf, asOf),
            { ambang: String(appliedThreshold) },
          )}
        />
      }
    >
      <ReportLetterhead
        title="Stok Tidak Bergerak"
        subtitle="Pemeriksaan Persediaan"
        periodLabel={periodLabel}
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-2 print:hidden">
        <ReportKpiCard
          label="Barang Dinilai"
          value={formatNumber(report.totals.assessed)}
        />
        <ReportKpiCard
          label="Tidak Bergerak"
          value={formatNumber(report.totals.slow)}
        />
        <ReportKpiCard
          label="Belum Pernah Keluar"
          value={formatNumber(report.totals.neverMoved)}
        />
        <ReportKpiCard
          label="Nilai Stok Tidak Bergerak"
          value={formatCurrency(report.totals.slowValue)}
          valueClassName="text-primary"
        />
      </div>
      <ReportTableView
        columns={report.table.columns}
        rows={report.table.rows}
        tableLabel="Stok Tidak Bergerak"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {slowMovingSummary(report)}
      </p>
      <p className="doc-lines">{report.verdict}</p>
    </ReportPageShell>
  )
}

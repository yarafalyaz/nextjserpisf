export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadBankMovements } from "@/lib/reports/bank-movements-data"
import { bankMovementsSummary } from "@/lib/reports/bank-movements"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Pembayaran & Penerimaan per Bank" }

/**
 * Penerimaan & pembayaran per rekening bank — rekening ini masuk berapa, keluar
 * berapa, dan arus bersihnya berapa.
 *
 * Nilainya **kas yang berpindah**: PPh yang dipotong pelanggan tidak masuk
 * rekening, jadi tidak dihitung di sini (ada di laporan Bukti Potong PPh). Itu
 * sebabnya angka laporan ini bisa dicocokkan dengan rekening koran.
 */
export default async function BankMovementsPage({
  params: routeParams,
  searchParams,
}: {
  params: Promise<{ segments?: string[] }>
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const user = await requirePermission("view_reports")

  // Periode dibaca hanya via helper bersama supaya tautan lama
  // ?tanggalMulai=&tanggalSelesai= tetap menampilkan periode yang diminta.
  const period = await reportPeriodFromRoute(routeParams, searchParams, (now) => ({
    start: new Date(now.getFullYear(), 0, 1),
    end: now,
  }))

  const { movements, periodLabel, periodCaption } = await loadBankMovements(period)

  return (
    <ReportPageShell
      title="Pembayaran & Penerimaan per Bank"
      sheetTitle="Pembayaran & Penerimaan per Bank"
      subtitle="Mutasi Kas & Bank per Periode"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      wide
      filter={
        <ReportPeriodFilter
          basePath="/laporan/pembayaran-per-bank"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Pembayaran & Penerimaan per Bank"
          pdfHref={buildReportPdfHref("pembayaran-per-bank", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={movements.summaryTable.columns}
        rows={movements.summaryTable.rows}
        tableLabel="Ringkasan per Rekening"
      />
      <ReportTableView
        columns={movements.detailTable.columns}
        rows={movements.detailTable.rows}
        tableLabel="Rincian Transaksi Bank"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {bankMovementsSummary(movements)} · penerimaan memakai kas yang benar-benar masuk rekening, sehingga
        PPh yang dipotong pelanggan tidak dihitung di sini.
      </p>
    </ReportPageShell>
  )
}

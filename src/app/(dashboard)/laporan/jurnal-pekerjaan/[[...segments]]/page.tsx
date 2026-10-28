export const dynamic = "force-dynamic"

import { formatCurrency } from "@/lib/utils/format"
import { requirePermission } from "@/lib/auth/permissions"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadJobOrderJournal } from "@/lib/reports/job-order-data"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Jurnal Pekerjaan Pesanan" }

/**
 * Rincian jurnal pekerjaan pesanan — pengeluaran bahan, penyerapan biaya
 * produksi, penyelesaian ke stok, dan selisih biaya, lengkap baris akunnya.
 *
 * Hanya jurnal POSTED, dan nomor pekerjaannya dilacak dari dokumen pemicu jurnal
 * (jurnal tidak menempel langsung ke pekerjaan). Jurnal yang dokumennya tidak
 * bisa dilacak tetap tampil dengan label "Tanpa pekerjaan".
 */
export default async function JobOrderJournalPage({
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

  const { journal, periodLabel, periodCaption } = await loadJobOrderJournal(period)
  const perReference = journal.byReference
    .map(
      (summary) =>
        `${summary.label} ${summary.count} jurnal (${formatCurrency(summary.amount)})`,
    )
    .join(" · ")

  return (
    <ReportPageShell
      title="Jurnal Pekerjaan Pesanan"
      sheetTitle="Jurnal Pekerjaan Pesanan"
      subtitle="Bahan, Biaya Produksi & Penyelesaian"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/jurnal-pekerjaan"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Jurnal Pekerjaan Pesanan"
          pdfHref={buildReportPdfHref("jurnal-pekerjaan", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={journal.table.columns}
        rows={journal.table.rows}
        tableLabel="Jurnal Pekerjaan Pesanan"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {journal.journalCount} jurnal terposting
        {perReference ? ` — ${perReference}` : ""} · total debit{" "}
        {formatCurrency(journal.totalDebit)} = kredit{" "}
        {formatCurrency(journal.totalCredit)}
        {journal.isBalanced ? "." : " — PERHATIAN: debit dan kredit tidak sama."}
      </p>
    </ReportPageShell>
  )
}

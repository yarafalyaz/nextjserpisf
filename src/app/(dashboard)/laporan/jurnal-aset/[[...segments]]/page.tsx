export const dynamic = "force-dynamic"

import { requirePermission } from "@/lib/auth/permissions"
import { formatCurrency } from "@/lib/utils/format"
import { toLocalDateOnly } from "@/lib/utils/date-only"
import { ExportButtons } from "@/components/reports/export-buttons"
import { ReportPageShell } from "@/components/reports/report-page-shell"
import { ReportPeriodFilter } from "@/components/reports/report-period-filter"
import { ReportTableView } from "@/components/reports/report-table-view"
import { reportPeriodFromRoute } from "@/lib/reports/report-period"
import { loadAssetJournal } from "@/lib/reports/asset-reports-data"
import { buildReportPdfHref } from "@/lib/reports/report-export"

import type { Metadata } from "next"

export const metadata: Metadata = { title: "Jurnal Aset Tetap" }

/**
 * Jurnal aset tetap — perolehan, penyusutan bulanan, dan pelepasan, lengkap
 * dengan akun debit/kreditnya.
 *
 * Hanya jurnal POSTED: jurnal draft belum mengubah buku besar, jadi
 * menampilkannya akan membuat laporan ini tidak bisa dicocokkan dengan Buku Besar.
 */
export default async function AssetJournalPage({
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

  const { journal, periodLabel, periodCaption } = await loadAssetJournal(period)
  const perKind = journal.byKind
    .map((summary) => `${summary.kind} ${summary.count} jurnal (${formatCurrency(summary.amount)})`)
    .join(" · ")

  return (
    <ReportPageShell
      title="Jurnal Aset Tetap"
      sheetTitle="Jurnal Aset Tetap"
      subtitle="Perolehan, Penyusutan & Pelepasan"
      periodLabel={periodLabel}
      periodCaption={periodCaption}
      printedBy={user.name ?? user.email}
      filter={
        <ReportPeriodFilter
          basePath="/laporan/jurnal-aset"
          mode="range"
          defaultStartDate={toLocalDateOnly(period.start)}
          defaultEndDate={toLocalDateOnly(period.end)}
        />
      }
      actions={
        <ExportButtons
          title="Jurnal Aset Tetap"
          pdfHref={buildReportPdfHref("jurnal-aset", period.slug)}
        />
      }
    >
      <ReportTableView
        columns={journal.table.columns}
        rows={journal.table.rows}
        tableLabel="Jurnal Aset Tetap"
      />
      <p className="doc-lines" style={{ marginTop: 8 }}>
        {journal.journalCount} jurnal terposting pada periode ini
        {perKind ? ` — ${perKind}` : ""} · total debit {formatCurrency(journal.totalDebit)} = kredit{" "}
        {formatCurrency(journal.totalCredit)}
        {journal.isBalanced ? "." : " — PERHATIAN: debit dan kredit tidak sama."}
      </p>
    </ReportPageShell>
  )
}

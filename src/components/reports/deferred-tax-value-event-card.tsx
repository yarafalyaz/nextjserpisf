import type { DeferredTaxValueEventResult } from "@/lib/reports/deferred-tax-value-events"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import { ReportTableView } from "./report-table-view"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-23-125-V (tahap frontend): SUMBER KEDUA perbedaan temporer pajak
 * tangguhan — peristiwa penyesuaian nilai aset (revaluasi/impairment). Data
 * dari loader `loadDeferredTaxValueEventSource` (builder murni
 * `buildDeferredTaxValueEventSource`): tabel, totals, `recognitionLabel`,
 * verdict, dan notice backend tampil apa adanya.
 *
 * Komponen ini tidak menghitung ulang komponen temporer, tidak memilih
 * tarif, tidak me-netting PPh final (pajak kini) ke indikasi tangguhan, dan
 * tidak menyediakan tombol jurnal apa pun. Bila sumber belum tersedia
 * (`sourceAvailable=false`, hari ini peristiwa F-111 belum terbekukan),
 * baris notice builder tampil apa adanya — bukan angka nol yang terbaca
 * "tidak ada perbedaan" — dan ringkasan tidak menampilkan Rp 0 satu pun.
 */
export function DeferredTaxValueEventCard({
  report,
}: Readonly<{ report: DeferredTaxValueEventResult }>) {
  const { totals } = report
  const available = report.sourceAvailable
  return (
    <ReportCardShell
      label="Sumber Nilai Pajak Tangguhan (Revaluasi/Impairment)"
      title="Sumber Nilai: Revaluasi & Impairment"
      summary={
        available ? (
          <>
            {formatNumber(totals.events)} peristiwa · {formatNumber(totals.computed)} terhitung ·{" "}
            {formatNumber(totals.unavailable)} tidak dihitung · indikasi liabilitas{" "}
            {formatCurrency(totals.deferredTaxLiabilityIndication)} · indikasi aset{" "}
            {formatCurrency(totals.deferredTaxAssetIndication)} ({report.recognitionLabel}) ·
            PPh final (pajak kini) {formatCurrency(totals.finalTaxCurrent)}
            {report.taxRatePercent !== null ? (
              <>
                {" "}
                · tarif {report.taxRatePercent}%
                {report.rateSourceLabel ? <> ({report.rateSourceLabel})</> : null}
              </>
            ) : null}
          </>
        ) : (
          <>{report.verdict}</>
        )
      }
      isEmpty={false}
      emptyText=""
    >
      <ReportTableView
        columns={report.table.columns}
        rows={report.table.rows}
        tableLabel="Sumber Nilai Pajak Tangguhan"
      />
      <p className="mt-4 text-sm text-muted-foreground">{report.verdict}</p>
      <p className="mt-2 text-sm text-muted-foreground">{report.notice}</p>
    </ReportCardShell>
  )
}

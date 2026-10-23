import type { DeferredTaxResult } from "@/lib/reports/deferred-tax"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import { ReportTableView } from "./report-table-view"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-23-112 tahap stok + konvergensi F-2026-10-23-124-V (tahap
 * frontend): laporan Perbedaan Temporer Pajak Tangguhan. Data dari loader
 * `loadDeferredTax` (builder `buildDeferredTaxTemporaryDifference`): tabel,
 * totals, verdict, dan notice backend tampil apa adanya — komponen ini
 * tidak menghitung ulang arah/tangguhan/dasar fiskal, tidak memasok tarif,
 * dan tidak menyediakan tombol jurnal apa pun. Tarif pasokan operator dan
 * jumlah fiskal-belum-terbekukan (`rateSourceLabel`, `totals.fiscalNotFrozen`)
 * tampil verbatim dari hasil builder.
 */
export function DeferredTaxCard({ report }: Readonly<{ report: DeferredTaxResult }>) {
  const { totals } = report
  return (
    <ReportCardShell
      label="Perbedaan Temporer Pajak Tangguhan"
      title="Perbedaan Temporer Pajak Tangguhan"
      summary={
        <>
          {formatNumber(totals.assets)} aset · {formatNumber(totals.excluded)} tidak masuk perbandingan ·{" "}
          {formatNumber(totals.fiscalNotFrozen)} fiskal belum terbekukan · liabilitas{" "}
          {formatCurrency(totals.deferredTaxLiability)} · aset {formatCurrency(totals.deferredTaxAsset)}
          {report.taxRatePercent !== null ? (
            <>
              {" "}
              · tarif {report.taxRatePercent}%
              {report.rateSourceLabel ? <> ({report.rateSourceLabel})</> : null}
            </>
          ) : null}
        </>
      }
      isEmpty={totals.assets === 0}
      emptyText="Tidak ada aset untuk dinilai perbedaan temporernya"
    >
      <ReportTableView
        columns={report.table.columns}
        rows={report.table.rows}
        tableLabel="Perbedaan Temporer Pajak Tangguhan"
      />
      <p className="mt-4 text-sm text-muted-foreground">{report.verdict}</p>
      <p className="mt-2 text-sm text-muted-foreground">{report.notice}</p>
    </ReportCardShell>
  )
}

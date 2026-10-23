import type { DeferredTaxResult } from "@/lib/reports/deferred-tax"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import { ReportTableView } from "./report-table-view"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-23-112 tahap stok (tahap frontend): laporan Perbedaan Temporer
 * Pajak Tangguhan. Data dari loader `loadDeferredTax` (builder
 * `buildDeferredTaxTemporaryDifference`, PR #628): tabel, totals, verdict,
 * dan notice backend tampil apa adanya — komponen ini tidak menghitung
 * ulang arah/tangguhan, dan tidak menyediakan tombol jurnal apa pun.
 */
export function DeferredTaxCard({ report }: Readonly<{ report: DeferredTaxResult }>) {
  const { totals } = report
  return (
    <ReportCardShell
      label="Perbedaan Temporer Pajak Tangguhan"
      title="Perbedaan Temporer Pajak Tangguhan"
      summary={
        <>
          {formatNumber(totals.assets)} aset · {formatNumber(totals.excluded)} tidak masuk perbandingan ·
          liabilitas {formatCurrency(totals.deferredTaxLiability)} · aset{" "}
          {formatCurrency(totals.deferredTaxAsset)}
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

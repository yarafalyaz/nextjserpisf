import type { DeferredTaxNonAssetResult } from "@/lib/reports/deferred-tax-nonaset"
import { formatCurrency, formatNumber } from "@/lib/utils/format"
import { ReportTableView } from "./report-table-view"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-23-126-V (tahap frontend): SUMBER TEMPORER NON-ASET pajak
 * tangguhan — provisi garansi, CKPN piutang, akumulasi rugi fiskal (sumber
 * 4/5/7 F-2026-10-23-112-V Putusan 1). Data dari loader
 * `loadDeferredTaxNonAssetSources` (builder murni
 * `buildDeferredTaxNonAssetSources`): tabel, baris per sumber (`lines`),
 * mutasi, kompensasi ditolak, verdict, dan notice backend tampil apa adanya.
 *
 * Komponen ini tidak menghitung ulang temporer/ECL/rugi fiskal, tidak
 * memilih tarif, tidak me-netting antar sumber (builder hanya menerbitkan
 * `deductibleBySource` per sumber), dan tidak menyediakan tombol jurnal apa
 * pun. Status bernama tiap sumber (nol terverifikasi jurnal / belum tersedia
 * bernama / penolakan bernama), label pengakuan, dan label risiko
 * kedaluwarsa tampil verbatim dari builder — bukan angka nol yang terbaca
 * "tidak ada perbedaan" untuk sumber yang belum tersedia.
 */
export function DeferredTaxNonAssetCard({
  report,
}: Readonly<{ report: DeferredTaxNonAssetResult }>) {
  const { totals, lines } = report
  return (
    <ReportCardShell
      label="Sumber Temporer Non-Aset Pajak Tangguhan"
      title="Sumber Non-Aset: Provisi, CKPN & Rugi Fiskal"
      summary={
        <>
          {formatNumber(lines.length)} sumber · indikasi aset{" "}
          {formatCurrency(totals.deferredTaxAssetIndication)}
          {report.taxRatePercent !== null ? (
            <>
              {" "}
              · tarif {report.taxRatePercent}%
              {report.rateSourceLabel ? <> ({report.rateSourceLabel})</> : null}
            </>
          ) : null}
        </>
      }
      isEmpty={false}
      emptyText=""
    >
      <ReportTableView
        columns={report.table.columns}
        rows={report.table.rows}
        tableLabel="Sumber Temporer Non-Aset Pajak Tangguhan"
      />
      {lines.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
          {lines.map((line) => (
            <li key={line.source}>
              <span className="font-medium text-foreground">{line.label}</span>
              {": "}
              {line.detail}
              {line.expiryRiskLabel ? <> — {line.expiryRiskLabel}</> : null}
              {" · "}
              {line.recognitionLabel}
            </li>
          ))}
        </ul>
      ) : null}
      {report.mutations.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
          {report.mutations.map((mutation) => (
            <li key={mutation}>Mutasi: {mutation}</li>
          ))}
        </ul>
      ) : null}
      {report.rejectedCompensations.length > 0 ? (
        <ul className="mt-4 space-y-1 text-sm text-muted-foreground">
          {report.rejectedCompensations.map((rejected) => (
            <li key={rejected}>{rejected}</li>
          ))}
        </ul>
      ) : null}
      <p className="mt-4 text-sm text-muted-foreground">{report.verdict}</p>
      <p className="mt-2 text-sm text-muted-foreground">{report.notice}</p>
    </ReportCardShell>
  )
}

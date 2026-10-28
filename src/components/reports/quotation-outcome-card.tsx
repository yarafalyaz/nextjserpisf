import type { QuotationOutcomeSummary } from "@/lib/reports/quotation-outcome"
import { formatNumber, formatPercentage } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-20-101 (tahap laporan): hasil penawaran menang/kalah/konversi.
 *
 * Data dari builder murni `buildQuotationOutcomeSummary` + loader
 * `getQuotationOutcome`: tingkat menang = diterima / (diterima + ditolak),
 * tingkat konversi = diterima yang punya pesanan/perintah kerja / diterima.
 * Komponen ini murni presentasi — tidak menghitung ulang tingkat dan tidak
 * menebak kategori penolakan lama.
 */
export function QuotationOutcomeCard({
  summary,
}: Readonly<{ summary: QuotationOutcomeSummary }>) {
  return (
    <ReportCardShell
      label="Hasil Penawaran"
      title="Hasil Penawaran"
      summary={
        <>
          {summary.totalQuotations} penawaran · tingkat menang{" "}
          {summary.winRate === null ? "–" : formatPercentage(summary.winRate * 100, 1)}
        </>
      }
      isEmpty={summary.totalQuotations === 0}
      emptyText="Belum ada penawaran pada periode ini"
    >
      <DetailTable>
        <DetailTableHead>
          <DetailTableTh>Ukuran</DetailTableTh>
          <DetailTableTh align="right">Penawaran</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          <DetailTableRow>
            <DetailTableTd>Total penawaran</DetailTableTd>
            <DetailTableTd align="right">{formatNumber(summary.totalQuotations)}</DetailTableTd>
          </DetailTableRow>
          <DetailTableRow>
            <DetailTableTd>Diterima</DetailTableTd>
            <DetailTableTd align="right">{formatNumber(summary.accepted)}</DetailTableTd>
          </DetailTableRow>
          <DetailTableRow>
            <DetailTableTd>Ditolak</DetailTableTd>
            <DetailTableTd align="right">{formatNumber(summary.rejected)}</DetailTableTd>
          </DetailTableRow>
          <DetailTableRow>
            <DetailTableTd>Berkonversi ke pesanan/perintah kerja</DetailTableTd>
            <DetailTableTd align="right">{formatNumber(summary.converted)}</DetailTableTd>
          </DetailTableRow>
          <DetailTableRow>
            <DetailTableTd>Tingkat menang</DetailTableTd>
            <DetailTableTd align="right">
              {summary.winRate === null ? "–" : formatPercentage(summary.winRate * 100, 1)}
            </DetailTableTd>
          </DetailTableRow>
          <DetailTableRow>
            <DetailTableTd>Tingkat konversi</DetailTableTd>
            <DetailTableTd align="right">
              {summary.conversionRate === null
                ? "–"
                : formatPercentage(summary.conversionRate * 100, 1)}
            </DetailTableTd>
          </DetailTableRow>
        </DetailTableBody>
      </DetailTable>
      <section aria-label="Penolakan per Kategori Kalah" className="mt-5">
        <h3 className="text-sm font-semibold text-foreground">Penolakan per Kategori Kalah</h3>
        {summary.lostByCategory.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">Belum ada penolakan pada periode ini</p>
        ) : (
          <DetailTable>
            <DetailTableHead>
              <DetailTableTh>Kategori Kalah</DetailTableTh>
              <DetailTableTh align="right">Penawaran</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {summary.lostByCategory.map((row) => (
                <DetailTableRow key={row.key}>
                  <DetailTableTd>{row.label}</DetailTableTd>
                  <DetailTableTd align="right">{formatNumber(row.count)}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        )}
      </section>
    </ReportCardShell>
  )
}

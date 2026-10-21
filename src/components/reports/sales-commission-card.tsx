import type { SalesCommissionRecap } from "@/lib/reports/sales-commission"
import { formatCurrency } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
  DetailTableFoot,
  DetailTableFootRow,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

/**
 * F-2026-10-22-053-S: permukaan rekap komisi informatif.
 *
 * Murni presentasi dari `getSalesCommissionRecap` (builder
 * `buildSalesCommissionRecap`, F-2026-10-21-016 tahap 2). Angka, urutan
 * baris, dan total tampil dari loader apa adanya; komponen tidak
 * menjumlah, mengalikan persen, atau menghitung ulang apa pun.
 * Filter penjual hanya menyaring baris tampil — total masa tetap angka
 * loader utuh (BR-KOM-04).
 */
export function SalesCommissionCard({
  report,
  selectedSalesEmployeeId,
}: Readonly<{
  report: SalesCommissionRecap
  /** Penjual terpilih dari filter tampil; null = semua penjual. */
  selectedSalesEmployeeId: number | null
}>) {
  const visibleRows =
    selectedSalesEmployeeId === null
      ? report.rows
      : report.rows.filter((row) => row.salesEmployeeId === selectedSalesEmployeeId)
  const showUnattributed = selectedSalesEmployeeId === null && report.unattributed.invoiceCount > 0
  const isEmpty = report.rows.length === 0 && report.unattributed.invoiceCount === 0

  return (
    <ReportCardShell
      label="rekap komisi penjualan"
      title="Rekap Komisi Penjualan"
      summary={<>{report.notice}</>}
      isEmpty={isEmpty}
      emptyText="Tidak ada faktur lunas pada masa ini."
    >
      <DetailTable data-report-table="rekap komisi penjualan">
        <DetailTableHead>
          <DetailTableTh>Penjual</DetailTableTh>
          <DetailTableTh align="right">Jumlah Faktur Lunas</DetailTableTh>
          <DetailTableTh align="right">Basis Faktur Lunas</DetailTableTh>
          <DetailTableTh align="right">Estimasi Komisi</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {visibleRows.map((row) => (
            <DetailTableRow key={row.salesEmployeeId}>
              <DetailTableTd className="font-medium">{row.salesEmployeeName || "—"}</DetailTableTd>
              <DetailTableTd align="right">{row.invoiceCount}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.paidBase)}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.estimatedCommission)}</DetailTableTd>
            </DetailTableRow>
          ))}
          {showUnattributed ? (
            <DetailTableRow>
              <DetailTableTd className="font-medium">Tanpa penjual tercatat</DetailTableTd>
              <DetailTableTd align="right">{report.unattributed.invoiceCount}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(report.unattributed.paidBase)}</DetailTableTd>
              <DetailTableTd align="right">—</DetailTableTd>
            </DetailTableRow>
          ) : null}
        </DetailTableBody>
        <DetailTableFoot>
          <DetailTableFootRow>
            <DetailTableTd className="font-bold">Total Basis Faktur Lunas</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              —
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(report.totalPaidBase)}
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              —
            </DetailTableTd>
          </DetailTableFootRow>
          <DetailTableFootRow>
            <DetailTableTd className="font-bold">Total Estimasi Komisi</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              —
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              —
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(report.totalEstimatedCommission)}
            </DetailTableTd>
          </DetailTableFootRow>
        </DetailTableFoot>
      </DetailTable>

      {selectedSalesEmployeeId !== null ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Total masa di atas tetap angka masa penuh — sudah termasuk faktur tanpa penjual.
        </p>
      ) : null}
    </ReportCardShell>
  )
}

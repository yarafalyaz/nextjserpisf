import type { SalesCommissionPayable } from "@/lib/reports/sales-commission-payable"
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
 * F-2026-10-25-037-S §5: permukaan saldo utang komisi per penjual.
 *
 * Murni presentasi dari builder `buildSalesCommissionPayable` (Backend
 * PR #911): saldo, total, baris rekonsiliasi, dan notice tampil apa adanya;
 * komponen TIDAK menjumlah, meng-clamp, atau menghitung ulang komisi/PPh.
 * Ledger belum live (`ledgerAvailable: false`) = kartu berlabel belum
 * tersedia dari builder, tanpa tabel saldo 0 yang menyesatkan.
 */
export function SalesCommissionPayableCard({
  report,
}: Readonly<{ report: SalesCommissionPayable }>) {
  const isEmpty = !report.ledgerAvailable || report.rows.length === 0

  return (
    <ReportCardShell
      label="saldo utang komisi penjualan"
      title="Saldo Utang Komisi Penjualan"
      summary={<>{report.notice}</>}
      isEmpty={isEmpty}
      emptyText={
        report.ledgerAvailable
          ? "Belum ada saldo utang komisi tercatat pada subledger."
          : report.notice
      }
    >
      {/* Penanda ekspor: ExportButtons membaca [data-report-narration] agar
          notice tidak lepas dari angka. */}
      <span className="hidden" data-report-narration={report.notice} aria-hidden="true" />
      <DetailTable data-report-table="saldo utang komisi penjualan">
        <DetailTableHead>
          <DetailTableTh>Penjual</DetailTableTh>
          <DetailTableTh align="right">Akrual</DetailTableTh>
          <DetailTableTh align="right">Lawan (Retur/Batal)</DetailTableTh>
          <DetailTableTh align="right">Terbayar via Slip</DetailTableTh>
          <DetailTableTh align="right">Saldo Utang</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {report.rows.map((row) => (
            <DetailTableRow key={row.salesEmployeeId}>
              <DetailTableTd className="font-medium">
                {row.salesEmployeeName || "Nama penjual tidak tercatat"}
              </DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.accruedAmount)}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.reversalAmount)}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.paidAmount)}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.balance)}</DetailTableTd>
            </DetailTableRow>
          ))}
        </DetailTableBody>
        <DetailTableFoot>
          <DetailTableFootRow>
            <DetailTableTd className="font-bold">Total Saldo Utang Komisi</DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              —
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              —
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              —
            </DetailTableTd>
            <DetailTableTd align="right" className="font-bold">
              {formatCurrency(report.totalBalance)}
            </DetailTableTd>
          </DetailTableFootRow>
        </DetailTableFoot>
      </DetailTable>
      {report.reconciliations.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">Baris Rekonsiliasi</h3>
          <DetailTable data-report-table="rekonsiliasi saldo utang komisi">
            <DetailTableHead>
              <DetailTableTh>Faktur Penjualan</DetailTableTh>
              <DetailTableTh>Penjual</DetailTableTh>
              <DetailTableTh>Alasan Rekonsiliasi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {report.reconciliations.map((item) => (
                <DetailTableRow key={`${item.salesInvoiceId}-${item.salesEmployeeId}`}>
                  <DetailTableTd>{item.salesInvoiceId}</DetailTableTd>
                  <DetailTableTd>
                    {report.rows.find((row) => row.salesEmployeeId === item.salesEmployeeId)
                      ?.salesEmployeeName || "Nama penjual tidak tercatat"}
                  </DetailTableTd>
                  <DetailTableTd>{item.reason}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      ) : null}
    </ReportCardShell>
  )
}

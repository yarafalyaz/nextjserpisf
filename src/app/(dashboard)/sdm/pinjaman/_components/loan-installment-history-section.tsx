import {
  LOAN_INSTALLMENT_UNKNOWN_STATUS_LABEL,
  type LoanInstallmentHistory,
} from "@/lib/reports/loan-installment-history"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { EmptyState } from "@/components/ui/empty-state"
import {
  DetailTable,
  DetailTableBody,
  DetailTableHead,
  DetailTableRow,
  DetailTableTd,
  DetailTableTh,
} from "@/components/ui/detail-table"
import { formatCurrency, formatDate } from "@/lib/utils/format"

/**
 * Histori cicilan per pinjaman (F-2026-10-25-019-S, AC-LH-F1/F2).
 *
 * Murni presentasi payload `loadLoanInstallmentHistory` server: notice,
 * label, angka terbayar/ember/cicilan berikutnya ditempel apa adanya —
 * UI tidak menjumlah, tidak mengalokasi nominal slip agregat ke pinjaman
 * ini (BR-LH-04), dan tidak menampilkan nominal gaji. Ledger tahap 1
 * selalu kosong dari loader (LH-B2 tahap 2); baris ledger hanya tampil
 * bila payload menyediakannya.
 */
export function LoanInstallmentHistorySection({
  history,
}: Readonly<{ history: LoanInstallmentHistory }>) {
  const { loan } = history
  const hasRows = history.ledgerRows.length > 0 || history.aggregateSlipRows.length > 0

  return (
    <section aria-label="Histori cicilan pinjaman" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Histori Cicilan</h2>
        <p className="text-sm text-muted-foreground">{history.notice}</p>
      </div>

      <DetailCard>
        <DetailField label={loan.paidLabel} value={formatCurrency(loan.totalPaidToDate)} />
        <DetailField label="Jumlah Pinjaman" value={formatCurrency(loan.totalAmount)} />
        <DetailField label="Sisa Pinjaman" value={formatCurrency(loan.remainingAmount)} />
        {history.nextInstallment ? (
          <DetailField
            label={history.nextInstallment.label}
            value={
              history.nextInstallment.amount === null
                ? "Tanpa jadwal mingguan"
                : formatCurrency(history.nextInstallment.amount)
            }
          />
        ) : null}
        {loan.isUnknownStatus ? (
          <DetailField
            label="Status"
            value={`${loan.status} (${LOAN_INSTALLMENT_UNKNOWN_STATUS_LABEL})`}
          />
        ) : null}
      </DetailCard>

      {history.hasUnallocated ? (
        <p
          role="note"
          className="rounded-xl border border-default bg-surface px-4 py-3 text-sm text-foreground"
        >
          {history.unallocatedLabel}:{" "}
          <span className="font-semibold tabular-nums">{formatCurrency(history.unallocatedAmount)}</span>
        </p>
      ) : null}

      {hasRows ? (
        <DetailTable data-report-table="Histori cicilan pinjaman">
          <DetailTableHead>
            <DetailTableTh>No. Slip</DetailTableTh>
            <DetailTableTh>Periode</DetailTableTh>
            <DetailTableTh>Tanggal Bayar</DetailTableTh>
            <DetailTableTh>Keterangan</DetailTableTh>
            <DetailTableTh align="right">Nominal</DetailTableTh>
          </DetailTableHead>
          <DetailTableBody>
            {history.ledgerRows.map((row) => (
              <DetailTableRow key={`ledger-${row.payrollId}`}>
                <DetailTableTd>{row.documentNo}</DetailTableTd>
                <DetailTableTd>—</DetailTableTd>
                <DetailTableTd>
                  {row.paymentDate ? formatDate(row.paymentDate, { format: "short" }) : "—"}
                </DetailTableTd>
                <DetailTableTd>{row.label}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(row.amount)}</DetailTableTd>
              </DetailTableRow>
            ))}
            {history.aggregateSlipRows.map((row) => (
              <DetailTableRow key={`agregat-${row.payrollId}`}>
                <DetailTableTd>{row.documentNo}</DetailTableTd>
                <DetailTableTd>{row.period}</DetailTableTd>
                <DetailTableTd>
                  {row.paymentDate ? formatDate(row.paymentDate, { format: "short" }) : "—"}
                </DetailTableTd>
                <DetailTableTd>{row.label}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(row.loanDeduction)}</DetailTableTd>
              </DetailTableRow>
            ))}
          </DetailTableBody>
        </DetailTable>
      ) : (
        <EmptyState title={history.emptyLabel} className="py-10" />
      )}
    </section>
  )
}

"use client"

import {
  LOAN_INSTALLMENT_UNKNOWN_STATUS_LABEL,
  type LoanInstallmentHistory,
} from "@/lib/reports/loan-installment-history"
import { DetailCard, DetailField } from "@/components/ui/detail-card"
import { EmptyState } from "@/components/ui/empty-state"
import { DataTable } from "@/components/ui/data-table"
import { createColumnHelper } from "@/lib/table"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"

type LoanInstallmentTableRow = {
  id: string
  documentNo: string
  period: string
  paymentDate: Date | string | null
  label: string
  amount: number
}

const columnHelper = createColumnHelper<LoanInstallmentTableRow>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Slip",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor("period", {
    header: "Periode",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("paymentDate", {
    header: "Tanggal Bayar",
    cell: (info) => {
      const val = info.getValue()
      return (
        <span className="font-mono tabular-nums">
          {val ? formatDate(val, { format: "short" }) : "-"}
        </span>
      )
    },
  }),
  columnHelper.accessor("label", {
    header: "Keterangan",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("amount", {
    header: "Nominal",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </span>
    ),
  }),
]

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
  const tableData: LoanInstallmentTableRow[] = [
    ...history.ledgerRows.map((row) => ({
      id: `ledger-${row.payrollId}`,
      documentNo: row.documentNo,
      period: "-",
      paymentDate: row.paymentDate,
      label: row.label,
      amount: row.amount,
    })),
    ...history.aggregateSlipRows.map((row) => ({
      id: `agregat-${row.payrollId}`,
      documentNo: row.documentNo,
      period: row.period,
      paymentDate: row.paymentDate,
      label: row.label,
      amount: row.loanDeduction,
    })),
  ]
  const hasRows = tableData.length > 0

  return (
    <section aria-label="Histori cicilan pinjaman" className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Histori Cicilan</h2>
        <p className="text-sm text-muted-foreground">{history.notice}</p>
      </div>

      <DetailCard>
        <DetailField label={loan.paidLabel} value={formatCurrencyExact(loan.totalPaidToDate)} />
        <DetailField label="Jumlah Pinjaman" value={formatCurrencyExact(loan.totalAmount)} />
        <DetailField label="Sisa Pinjaman" value={formatCurrencyExact(loan.remainingAmount)} />
        {history.nextInstallment ? (
          <DetailField
            label={history.nextInstallment.label}
            value={
              history.nextInstallment.amount === null
                ? "Tanpa jadwal mingguan"
                : formatCurrencyExact(history.nextInstallment.amount)
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
          <span className="font-semibold tabular-nums">{formatCurrencyExact(history.unallocatedAmount)}</span>
        </p>
      ) : null}

      {hasRows ? (
        <DataTable
          data={tableData}
          columns={columns}
          ariaLabel="Histori cicilan pinjaman"
          selectable={false}
          enableColumnToggle={false}
          enableExport={false}
          pageSize={50}
        />
      ) : (
        <EmptyState title={history.emptyLabel} className="py-10" />
      )}
    </section>
  )
}

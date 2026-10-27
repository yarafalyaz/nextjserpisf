import type {
  SalesCommissionPayable,
  SalesCommissionPayableReconciliation,
} from "@/lib/reports/sales-commission-payable"
import type { SalesCommissionSubledgerLine } from "@/lib/reports/sales-commission-subledger"
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
import { StatusChip } from "@/components/ui/status-chip"
import { ReportCardShell } from "./report-card-shell"

const RECONCILIATION_REASON_LABELS: Record<string, string> = {
  "lawan-melebihi-akrual": "Lawan (retur/batal) melebihi akrual",
  "saldo-negatif-retur-sesudah-terbayar": "Saldo negatif — retur sesudah komisi terbayar",
}

function reconciliationReasonLabel(reason: string): string {
  return RECONCILIATION_REASON_LABELS[reason] ?? reason
}

function sellerName(name: string): string {
  return name || "Nama penjual tidak tercatat"
}

/**
 * F-2026-10-25-049-S: permukaan subledger komisi per penerima.
 *
 * Murni presentasi dari loader server `getSalesCommissionSubledgerRecap`
 * (Backend PR #1032): saldo per penerima, rincian baris per faktur, status
 * turunan per baris, total, baris rekonsiliasi, dan notice tampil apa
 * adanya dari builder server; komponen TIDAK menjumlah, meng-clamp,
 * menurunkan status, atau menghitung ulang komisi/PPh. Akun rujukan utang
 * komisi 210212 (vonis 039-V). Ledger belum live (`ledgerAvailable:
 * false`) = notice UNAVAILABLE verbatim sebagai teks kosong berlabel
 * jujur — saldo 0 bukan utang dan tidak ditampilkan sebagai tabel utang.
 */
export function SalesCommissionSubledgerCard({
  payable,
  lineStatuses,
  selectedSalesEmployeeId,
}: Readonly<{
  payable: SalesCommissionPayable
  lineStatuses: SalesCommissionSubledgerLine[]
  /** Penerima terpilih dari filter tampil halaman; null = semua penerima. */
  selectedSalesEmployeeId?: number | null
}>) {
  const selected = selectedSalesEmployeeId ?? null
  const visibleRows =
    selected === null
      ? payable.rows
      : payable.rows.filter((row) => row.salesEmployeeId === selected)
  const isEmpty = !payable.ledgerAvailable || visibleRows.length === 0
  const statusByLine = new Map(
    lineStatuses.map((line) => [`${line.salesInvoiceId}:${line.salesEmployeeId}`, line.status]),
  )
  const nameByEmployee = new Map(
    payable.rows.map((row) => [row.salesEmployeeId, sellerName(row.salesEmployeeName)]),
  )

  return (
    <ReportCardShell
      label="subledger komisi per penerima"
      title="Subledger Komisi per Penerima"
      summary={<>{payable.notice}</>}
      isEmpty={isEmpty}
      emptyText={
        payable.ledgerAvailable
          ? selected !== null
            ? "Penerima terpilih tidak memiliki baris subledger komisi tercatat."
            : "Belum ada baris subledger komisi tercatat per penerima."
          : payable.notice
      }
    >
      {/* Penanda ekspor: notice verbatim terbawa bersama angka. */}
      <span className="hidden" data-report-narration={payable.notice} aria-hidden="true" />
      <p className="mb-3 text-xs text-muted-foreground">
        Saldo per penerima dari baris subledger komisi pada akun Utang Komisi Penjualan (210212).
        Rincian per faktur mengikuti baris subledger server; status baris adalah status turunan
        server, bukan hitungan halaman ini.
      </p>
      <DetailTable data-report-table="subledger komisi per penerima">
        <DetailTableHead>
          <DetailTableTh>Penerima Komisi</DetailTableTh>
          <DetailTableTh>Faktur Penjualan</DetailTableTh>
          <DetailTableTh>Status Baris</DetailTableTh>
          <DetailTableTh align="right">Akrual</DetailTableTh>
          <DetailTableTh align="right">Lawan (Retur/Batal)</DetailTableTh>
          <DetailTableTh align="right">Terbayar via Slip</DetailTableTh>
          <DetailTableTh align="right">Saldo</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          {visibleRows.map((row) => [
            <DetailTableRow key={`penerima-${row.salesEmployeeId}`}>
              <DetailTableTd className="font-medium">
                {sellerName(row.salesEmployeeName)}
              </DetailTableTd>
              <DetailTableTd>—</DetailTableTd>
              <DetailTableTd>—</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.accruedAmount)}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.reversalAmount)}</DetailTableTd>
              <DetailTableTd align="right">{formatCurrency(row.paidAmount)}</DetailTableTd>
              <DetailTableTd align="right" className="font-medium">
                {formatCurrency(row.balance)}
              </DetailTableTd>
            </DetailTableRow>,
            ...row.lines.map((line) => (
              <DetailTableRow key={`baris-${row.salesEmployeeId}-${line.salesInvoiceId}`}>
                <DetailTableTd>{sellerName(row.salesEmployeeName)}</DetailTableTd>
                <DetailTableTd>{line.salesInvoiceId}</DetailTableTd>
                <DetailTableTd>
                  {statusByLine.get(`${line.salesInvoiceId}:${line.salesEmployeeId}`) ? (
                    <StatusChip
                      status={statusByLine.get(`${line.salesInvoiceId}:${line.salesEmployeeId}`)!}
                    />
                  ) : (
                    "—"
                  )}
                </DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(line.accruedAmount)}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(line.reversalAmount)}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(line.paidAmount)}</DetailTableTd>
                <DetailTableTd align="right">{formatCurrency(line.balance)}</DetailTableTd>
              </DetailTableRow>
            )),
          ])}
        </DetailTableBody>
        <DetailTableFoot>
          <DetailTableFootRow>
            <DetailTableTd className="font-bold">Total Saldo Subledger Komisi</DetailTableTd>
            <DetailTableTd className="font-bold">—</DetailTableTd>
            <DetailTableTd className="font-bold">—</DetailTableTd>
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
              {formatCurrency(payable.totalBalance)}
            </DetailTableTd>
          </DetailTableFootRow>
        </DetailTableFoot>
      </DetailTable>

      {selected !== null ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Total saldo di atas tetap total subledger penuh dari server — filter hanya menyaring
          penerima yang tampil.
        </p>
      ) : null}

      {payable.reconciliations.filter(
        (item) => selected === null || item.salesEmployeeId === selected,
      ).length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-foreground">Baris Rekonsiliasi</h3>
          <DetailTable data-report-table="rekonsiliasi subledger komisi">
            <DetailTableHead>
              <DetailTableTh>Faktur Penjualan</DetailTableTh>
              <DetailTableTh>Penerima Komisi</DetailTableTh>
              <DetailTableTh>Alasan Rekonsiliasi</DetailTableTh>
            </DetailTableHead>
            <DetailTableBody>
              {payable.reconciliations
                .filter((item) => selected === null || item.salesEmployeeId === selected)
                .map((item: SalesCommissionPayableReconciliation) => (
                <DetailTableRow key={`${item.salesInvoiceId}-${item.salesEmployeeId}`}>
                  <DetailTableTd>{item.salesInvoiceId}</DetailTableTd>
                  <DetailTableTd>
                    {nameByEmployee.get(item.salesEmployeeId) ?? "Nama penjual tidak tercatat"}
                  </DetailTableTd>
                  <DetailTableTd>{reconciliationReasonLabel(item.reason)}</DetailTableTd>
                </DetailTableRow>
              ))}
            </DetailTableBody>
          </DetailTable>
        </div>
      ) : null}
    </ReportCardShell>
  )
}

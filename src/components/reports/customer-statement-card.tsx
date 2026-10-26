import {
  CUSTOMER_STATEMENT_DUE_COLUMN,
  CUSTOMER_STATEMENT_OVERDUE_LABEL,
  type CustomerStatement,
  type CustomerStatementEntryKind,
} from "@/lib/reports/customer-statement"
import { Badge } from "@/components/ui/shadcn/badge"
import { formatAccounting, formatDate } from "@/lib/utils/format"
import {
  DetailTable,
  DetailTableHead,
  DetailTableTh,
  DetailTableBody,
  DetailTableRow,
  DetailTableTd,
} from "@/components/ui/detail-table"
import { ReportCardShell } from "./report-card-shell"

const ENTRY_KIND_LABEL: Record<CustomerStatementEntryKind, string> = {
  invoice: "Faktur penjualan",
  payment: "Pembayaran",
  credit: "Alokasi kredit",
  return: "Retur penjualan",
}

/**
 * F-2026-10-21-032 — kartu Statement Pelanggan.
 * Komponen murni presentasi dari builder backend `buildCustomerStatement`
 * (loader `loadCustomerStatement`): saldo awal, baris mutasi periode dengan
 * saldo berjalan, total debit/kredit, dan saldo akhir ditampilkan apa
 * adanya — komponen ini TIDAK menghitung ulang mutasi, pelunasan, atau
 * outstanding piutang. Kolom Jatuh Tempo + penanda Lewat Jatuh Tempo
 * (F-2026-10-25-025-S) juga ditampilkan apa adanya dari builder
 * (`entry.dueDate`/`entry.isOverdue` turunan per periodEnd server);
 * label memakai konstanta verbatim builder, UI tidak menghitung
 * umur/tanggal sendiri. Jenis baris dibedakan eksplisit per `kind`
 * (Faktur penjualan / Pembayaran / Alokasi kredit / Retur penjualan); kredit hanya dari
 * alokasi CustomerCredit builder (paymentMethod "customer_credit"),
 * bukan dokumen kredit kedua — anti-dobel mengikuti builder, bukan UI.
 */
export function CustomerStatementCard({ statement }: Readonly<{ statement: CustomerStatement }>) {
  const isEmpty = statement.entries.length === 0
  const currency = (value: number) => formatAccounting(value, { zeroDash: false })
  const openingBalanceText = currency(statement.openingBalance)
  const closingBalanceText = currency(statement.closingBalance)
  const totalDebitText = currency(statement.totalDebit)
  const totalCreditText = currency(statement.totalCredit)
  return (
    <ReportCardShell
      label="Statement pelanggan"
      title="Statement pelanggan"
      summary={
        isEmpty
          ? "Periode tanpa mutasi · Saldo awal " + openingBalanceText + " · Saldo akhir " + closingBalanceText
          : `${statement.entries.length} baris mutasi · Saldo akhir ${closingBalanceText}`
      }
      isEmpty={isEmpty}
      emptyText="Tidak ada mutasi piutang pada periode ini."
    >
      <DetailTable data-report-table="Statement Pelanggan">
        <DetailTableHead>
          <DetailTableTh>Tanggal</DetailTableTh>
          <DetailTableTh>{CUSTOMER_STATEMENT_DUE_COLUMN}</DetailTableTh>
          <DetailTableTh>Dokumen</DetailTableTh>
          <DetailTableTh>Jenis</DetailTableTh>
          <DetailTableTh>Keterangan</DetailTableTh>
          <DetailTableTh align="right">Debit</DetailTableTh>
          <DetailTableTh align="right">Kredit</DetailTableTh>
          <DetailTableTh align="right">Saldo</DetailTableTh>
        </DetailTableHead>
        <DetailTableBody>
          <DetailTableRow className="font-semibold">
            <DetailTableTd>Saldo awal</DetailTableTd>
            <DetailTableTd>–</DetailTableTd>
            <DetailTableTd>–</DetailTableTd>
            <DetailTableTd>–</DetailTableTd>
            <DetailTableTd>Saldo awal</DetailTableTd>
            <DetailTableTd align="right">–</DetailTableTd>
            <DetailTableTd align="right">–</DetailTableTd>
            <DetailTableTd align="right">{openingBalanceText}</DetailTableTd>
          </DetailTableRow>

          {statement.entries.map((entry, index) => (
            <DetailTableRow key={`${entry.date.toISOString()}-${entry.documentNo}-${entry.kind}-${index}`}>
              <DetailTableTd>{formatDate(entry.date, { format: "short" })}</DetailTableTd>
              <DetailTableTd>
                {entry.dueDate ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    {formatDate(entry.dueDate, { format: "short" })}
                    {entry.isOverdue ? <Badge variant="destructive">{CUSTOMER_STATEMENT_OVERDUE_LABEL}</Badge> : null}
                  </span>
                ) : (
                  "—"
                )}
              </DetailTableTd>
              <DetailTableTd className="font-mono text-xs">{entry.documentNo}</DetailTableTd>
              <DetailTableTd className="text-xs">{ENTRY_KIND_LABEL[entry.kind]}</DetailTableTd>
              <DetailTableTd className="text-xs">
                {entry.description}
                {entry.referenceDocumentNo && !entry.description.includes(entry.referenceDocumentNo) ? <span className="text-muted-foreground"> · Faktur {entry.referenceDocumentNo}</span> : null}
              </DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(entry.debit)}</DetailTableTd>
              <DetailTableTd align="right">{formatAccounting(entry.credit)}</DetailTableTd>
              <DetailTableTd align="right" className="font-semibold">{currency(entry.balance)}</DetailTableTd>
            </DetailTableRow>
          ))}

          <DetailTableRow className="border-t-2 border-default font-bold">
            <DetailTableTd>Saldo akhir</DetailTableTd>
            <DetailTableTd>–</DetailTableTd>
            <DetailTableTd>–</DetailTableTd>
            <DetailTableTd>–</DetailTableTd>
            <DetailTableTd>Saldo akhir · Total debit {totalDebitText} · Total kredit {totalCreditText}</DetailTableTd>
            <DetailTableTd align="right">{totalDebitText}</DetailTableTd>
            <DetailTableTd align="right">{totalCreditText}</DetailTableTd>
            <DetailTableTd align="right">{closingBalanceText}</DetailTableTd>
          </DetailTableRow>
        </DetailTableBody>
      </DetailTable>
    </ReportCardShell>
  )
}

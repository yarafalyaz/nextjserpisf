"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteBankTransfer } from "@/actions/bank-transfer.actions"
import { formatAccounting } from "@/lib/utils/format"

interface BankTransferRow {
  id: number
  documentNo: string
  date: string
  from: string
  to: string
  amount: number
  adminFee: number
  journalId: number | null
}

const columnHelper = createColumnHelper<BankTransferRow>()

const columns = [
  columnHelper.accessor("date", { header: "Tanggal" }),
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => <span className="font-mono text-sm">{info.getValue()}</span>,
  }),
  columnHelper.accessor("from", { header: "Dari Rekening" }),
  columnHelper.accessor("to", { header: "Ke Rekening" }),
  columnHelper.accessor("amount", {
    header: "Jumlah",
    cell: (info) => <span className="tabular-nums">{formatAccounting(info.getValue())}</span>,
  }),
  columnHelper.accessor("adminFee", {
    header: "Biaya Admin",
    cell: (info) => <span className="tabular-nums">{formatAccounting(info.getValue())}</span>,
  }),
  columnHelper.display({
    id: "journal",
    header: "No. Jurnal",
    enableSorting: false,
    cell: (info) => (
      <span className="text-xs text-muted-foreground font-mono">
        {info.row.original.journalId ? `#${info.row.original.journalId}` : "–"}
      </span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        deleteAction={deleteBankTransfer}
        deleteId={info.row.original.id}
        deletePermission="delete_bank_transfers"
      />
    ),
  }),
]

export function BankTransferTable({ data }: { data: BankTransferRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar transfer antar rekening"
      searchColumn="documentNo"
      searchPlaceholder="Cari nomor dokumen..."
    />
  )
}

"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteInvoiceExchange } from "@/actions/invoice-exchange.actions"
import { formatAccounting } from "@/lib/utils/format"
import { settlementStatus, SETTLEMENT_LABEL } from "@/lib/finance/invoice-exchange"

interface InvoiceExchangeRow {
  id: number
  documentNo: string
  date: string
  customerName: string
  receiptNumber: string | null
  dueDate: string | null
  invoiceCount: number
  amount: number
  paid: number
}

const columnHelper = createColumnHelper<InvoiceExchangeRow>()

const columns = [
  columnHelper.accessor("date", { header: "Tanggal" }),
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => <span className="font-mono text-sm">{info.getValue()}</span>,
  }),
  columnHelper.accessor("customerName", { header: "Pelanggan" }),
  columnHelper.accessor("receiptNumber", {
    header: "Tanda Terima",
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ?? "—"}</span>,
  }),
  columnHelper.accessor("dueDate", {
    header: "Jatuh Tempo",
    cell: (info) => <span className="text-sm">{info.getValue() ?? "—"}</span>,
  }),
  columnHelper.accessor("invoiceCount", {
    header: "Faktur",
    cell: (info) => <span className="tabular-nums">{info.getValue()}</span>,
  }),
  columnHelper.accessor("amount", {
    header: "Nilai",
    cell: (info) => <span className="tabular-nums">{formatAccounting(info.getValue())}</span>,
  }),
  columnHelper.display({
    id: "outstanding",
    header: "Sisa",
    enableSorting: false,
    cell: (info) => (
      <span className="tabular-nums">
        {formatAccounting(info.row.original.amount - info.row.original.paid)}
      </span>
    ),
  }),
  columnHelper.display({
    id: "status",
    header: "Status",
    enableSorting: false,
    cell: (info) => (
      <span className="text-sm">
        {SETTLEMENT_LABEL[settlementStatus(info.row.original.amount, info.row.original.paid)]}
      </span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        deleteAction={deleteInvoiceExchange}
        deleteId={info.row.original.id}
        deletePermission="delete_invoice_exchanges"
      />
    ),
  }),
]

export function InvoiceExchangeTable({ data }: { data: InvoiceExchangeRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar tukar faktur"
      searchColumn="documentNo"
      searchPlaceholder="Cari nomor dokumen..."
    />
  )
}

"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteTaxPayment } from "@/actions/tax-payment.actions"
import { formatAccounting } from "@/lib/utils/format"

interface TaxPaymentRow {
  id: number
  documentNo: string
  date: string
  period: string | null
  typeLabel: string
  reference: string | null
  amount: number
  journalId: number | null
}

const columnHelper = createColumnHelper<TaxPaymentRow>()

const columns = [
  columnHelper.accessor("date", { header: "Tanggal" }),
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => <span className="font-mono text-sm">{info.getValue()}</span>,
  }),
  columnHelper.accessor("period", {
    header: "Masa",
    cell: (info) => <span className="text-sm">{info.getValue() ?? "—"}</span>,
  }),
  columnHelper.accessor("typeLabel", { header: "Jenis" }),
  columnHelper.accessor("reference", {
    header: "SSP / MPN",
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ?? "—"}</span>,
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah",
    cell: (info) => <span className="tabular-nums">{formatAccounting(info.getValue())}</span>,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        deleteAction={deleteTaxPayment}
        deleteId={info.row.original.id}
        deletePermission="delete_tax_payments"
      />
    ),
  }),
]

export function TaxPaymentTable({ data }: { data: TaxPaymentRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar penyetoran pajak"
      searchColumn="documentNo"
      searchPlaceholder="Cari nomor dokumen..."
    />
  )
}

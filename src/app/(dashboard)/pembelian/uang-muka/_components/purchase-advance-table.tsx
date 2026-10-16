"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deletePurchaseAdvance } from "@/actions/purchase-advance.actions"
import { formatAccounting } from "@/lib/utils/format"

interface PurchaseAdvanceRow {
  id: number
  documentNo: string
  date: string
  vendorName: string
  description: string | null
  amount: number
  journalId: number | null
}

const columnHelper = createColumnHelper<PurchaseAdvanceRow>()

const columns = [
  columnHelper.accessor("date", { header: "Tanggal" }),
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => <span className="font-mono text-sm">{info.getValue()}</span>,
  }),
  columnHelper.accessor("vendorName", { header: "Pemasok" }),
  columnHelper.accessor("description", {
    header: "Keterangan",
    cell: (info) => <span className="text-sm text-muted-foreground">{info.getValue() ?? "—"}</span>,
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah",
    cell: (info) => <span className="tabular-nums">{formatAccounting(info.getValue())}</span>,
  }),
  columnHelper.display({
    id: "journal",
    header: "No. Jurnal",
    enableSorting: false,
    cell: (info) => (
      <span className="text-xs font-mono text-muted-foreground">
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
        deleteAction={deletePurchaseAdvance}
        deleteId={info.row.original.id}
        deletePermission="delete_purchase_advances"
      />
    ),
  }),
]

export function PurchaseAdvanceTable({ data }: { data: PurchaseAdvanceRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar uang muka pembelian"
      searchColumn="documentNo"
      searchPlaceholder="Cari nomor dokumen..."
    />
  )
}

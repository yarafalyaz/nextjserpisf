"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteBarcode } from "@/actions/master.actions"

interface Barcode {
  id: number
  barcode: string
  type: string
  item: { name: string }
}

const columnHelper = createColumnHelper<Barcode>()

const columns = [
  columnHelper.accessor("barcode", {
    header: "Barcode",
    cell: (info) => <span className="font-medium font-mono">{info.getValue()}</span>,
  }),
  columnHelper.display({
    id: "itemName",
    header: "Item",
    cell: (info) => info.row.original.item?.name ?? "-",
  }),
  columnHelper.accessor("type", {
    header: "Tipe",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown deleteAction={deleteBarcode} deleteId={info.row.original.id} />
    ),
  }),
]

interface BarcodeTableProps {
  data: Barcode[]
}

export function BarcodeTable({ data }: BarcodeTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar barcode"
      pageSize={20}
      selectable={true}
      searchColumn="barcode"
      searchPlaceholder="Cari barcode..."
    />
  )
}

"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteTaxGroup } from "@/actions/master.actions"

interface TaxGroup {
  id: number
  name: string
  taxNames: string
}

const columnHelper = createColumnHelper<TaxGroup>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  columnHelper.accessor("taxNames", {
    header: "Pajak Termasuk",
    enableSorting: false,
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown deleteAction={deleteTaxGroup} deleteId={info.row.original.id} />
    ),
  }),
]

interface TaxGroupTableProps {
  data: TaxGroup[]
}

export function TaxGroupTable({ data }: TaxGroupTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar grup pajak"
      pageSize={20}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama grup pajak..."
    />
  )
}

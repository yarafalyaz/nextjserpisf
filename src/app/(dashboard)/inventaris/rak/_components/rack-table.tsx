"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteRack } from "@/actions/inventory.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface Warehouse {
  name: string
}

interface RackRow {
  id: number
}

interface Rack {
  id: number
  name: string
  warehouse: Warehouse
  rows: RackRow[]
}

const columnHelper = createColumnHelper<Rack>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/inventaris/rak/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("warehouse.name", {
    header: "Gudang",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("rows", {
    header: "Jumlah Baris",
    cell: (info) => info.getValue().length,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/inventaris/rak/${info.row.original.id}`}
        editHref={`/inventaris/rak/${info.row.original.id}/ubah`}
        deleteAction={deleteRack}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface RackTableProps {
  data: Rack[]
}

export function RackTable({ data }: RackTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar rak"
      pageSize={20}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama rak..."
      onBulkDelete={(ids) => bulkDelete("rack", ids)}
    />
  )
}

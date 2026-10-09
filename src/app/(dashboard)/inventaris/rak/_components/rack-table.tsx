"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteRack } from "@/actions/inventory.actions"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

interface Warehouse {
  name: string
}

interface RackRow {
  id: number
}

interface Rack {
  id: number
  name: string
  slug: string | null
  warehouse: Warehouse
  rows: RackRow[]
}

const columnHelper = createColumnHelper<Rack>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={entityHref("/inventaris/rak", info.row.original)} className="text-foreground hover:underline font-medium">
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
        viewHref={entityHref("/inventaris/rak", info.row.original)}
        editHref={entityEditHref("/inventaris/rak", info.row.original)}
        deleteAction={deleteRack}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface RackTableProps {
  data: Rack[]
  total: number
  page: number
  pageSize: number
}

export function RackTable({ data, total, page, pageSize }: RackTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar rak"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama rak..."
      onBulkDelete={(ids) => bulkDelete("rack", ids)}
    />
  )
}

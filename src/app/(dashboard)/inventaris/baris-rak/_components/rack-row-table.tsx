"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteRackRow } from "@/actions/inventory.actions"
import { bulkDelete } from "@/actions/bulk.actions"
import { formatDate } from "@/lib/utils/format"

interface RackRowData {
  id: number
  code: string | null
  name: string
  createdAt: string
  rack: {
    name: string
    warehouse: {
      name: string
    }
  }
}

const columnHelper = createColumnHelper<RackRowData>()

const columns = [
  columnHelper.accessor("rack.warehouse.name", {
    header: "Gudang",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("rack.name", {
    header: "Rak",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => (
      <span className="font-mono">{info.getValue() || "-"}</span>
    ),
  }),
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/inventaris/baris-rak/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("createdAt", {
    header: "Dibuat",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/inventaris/baris-rak/${info.row.original.id}`}
        editHref={`/inventaris/baris-rak/${info.row.original.id}/ubah`}
        deleteAction={deleteRackRow}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface RackRowTableProps {
  data: RackRowData[]
}

export function RackRowTable({ data }: RackRowTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar baris rak"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("rackRow", ids)}
    />
  )
}

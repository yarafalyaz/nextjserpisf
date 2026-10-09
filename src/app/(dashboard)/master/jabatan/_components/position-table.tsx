"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deletePosition } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface Position {
  id: number
  name: string
  department: { name: string } | null
}

const columnHelper = createColumnHelper<Position>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/master/jabatan/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor((row) => row.department?.name, {
    id: "departmentName",
    header: "Departemen",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        editHref={`/master/jabatan/${info.row.original.id}/ubah`}
        deleteAction={deletePosition}
        deleteId={info.row.original.id}
        editPermission="edit_positions"
        deletePermission="delete_positions"
      />
    ),
  }),
]

interface PositionTableProps {
  data: Position[]
  total: number
  page: number
  pageSize: number
}

export function PositionTable({ data, total, page, pageSize }: PositionTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar jabatan"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama jabatan..."
      onBulkDelete={(ids) => bulkDelete("position", ids)}
    />
  )
}

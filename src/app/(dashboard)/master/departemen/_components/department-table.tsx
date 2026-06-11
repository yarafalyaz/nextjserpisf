"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteDepartment } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface Department {
  id: number
  code: string | null
  name: string
  description: string | null
}

const columnHelper = createColumnHelper<Department>()

const columns = [
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => <span className="font-mono">{info.getValue() || "-"}</span>,
  }),
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/master/departemen/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("description", {
    header: "Deskripsi",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/master/departemen/${info.row.original.id}`}
        editHref={`/master/departemen/${info.row.original.id}/ubah`}
        deleteAction={deleteDepartment}
        deleteId={info.row.original.id}
        editPermission="edit_departments"
        deletePermission="delete_departments"
      />
    ),
  }),
]

interface DepartmentTableProps {
  data: Department[]
}

export function DepartmentTable({ data }: DepartmentTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar departemen"
      pageSize={20}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama atau kode..."
      onBulkDelete={(ids) => bulkDelete("department", ids)}
    />
  )
}

"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteDepartment } from "@/actions/master.actions"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

interface Department {
  id: number
  code: string | null
  name: string
  slug: string | null
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
      <Link href={entityHref("/master/departemen", info.row.original)} className="text-foreground hover:underline font-medium">
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
        viewHref={entityHref("/master/departemen", info.row.original)}
        editHref={entityEditHref("/master/departemen", info.row.original)}
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
  total: number
  page: number
  pageSize: number
}

export function DepartmentTable({ data, total, page, pageSize }: DepartmentTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar departemen"
      selectable={true}
      searchPlaceholder="Cari nama atau kode..."
      onBulkDelete={(ids) => bulkDelete("department", ids)}
      serverPagination={{ total, page, pageSize }}
      searchParam="cari"
    />
  )
}

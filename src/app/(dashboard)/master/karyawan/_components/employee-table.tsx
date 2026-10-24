"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteEmployee } from "@/actions/master.actions"
import { getInitials } from "@/lib/utils/format"
import { Avatar, AvatarFallback } from "@/components/ui/shadcn/avatar"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { employmentStatusLabel } from "@/lib/reports/employee-lifecycle"

interface Employee {
  id: number
  employeeNo: string
  name: string
  slug: string | null
  department: { name: string } | null
  position: { name: string } | null
  phone: string | null
  employmentStatus?: string | null
  isActive: boolean
  user?: {
    roles: { name: string }[]
  } | null
}

const columnHelper = createColumnHelper<Employee>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <div className="flex items-center gap-2">
        <Avatar size="sm" className="bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400">
          <AvatarFallback className="bg-transparent text-inherit">{getInitials(info.getValue())}</AvatarFallback>
        </Avatar>
        <Link href={entityHref("/master/karyawan", info.row.original)} className="text-foreground hover:underline font-medium">
          {info.getValue()}
        </Link>
      </div>
    ),
  }),
  columnHelper.accessor("employeeNo", {
    header: "NIP",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor((row) => row.position?.name, {
    id: "positionName",
    header: "Jabatan",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor((row) => row.department?.name, {
    id: "departmentName",
    header: "Departemen",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor((row) => row.user?.roles.map(r => r.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())).join(", "), {
    id: "rolesName",
    header: "Peran",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("phone", {
    header: "Telepon",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("employmentStatus", {
    header: "Status Kepegawaian",
    cell: (info) => employmentStatusLabel(info.getValue()),
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => (
      <StatusChip status={info.getValue() ? "Aktif" : "Nonaktif"} />
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/master/karyawan", info.row.original)}
        editHref={entityEditHref("/master/karyawan", info.row.original)}
        deleteAction={deleteEmployee}
        deleteId={info.row.original.id}
        editPermission="edit_employees"
        deletePermission="delete_employees"
      />
    ),
  }),
]

interface EmployeeTableProps {
  data: Employee[]
  total: number
  page: number
  pageSize: number
}

export function EmployeeTable({ data, total, page, pageSize }: EmployeeTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar karyawan"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama, NIP, atau telepon..."
      onBulkDelete={(ids) => bulkDelete("employee", ids)}
    />
  )
}

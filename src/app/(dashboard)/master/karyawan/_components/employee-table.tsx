"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteEmployee } from "@/actions/master.actions"
import { getInitials } from "@/lib/utils/format"
import { Avatar, AvatarFallback } from "@/components/ui/shadcn/avatar"
import { bulkDelete } from "@/actions/bulk.actions"

interface Employee {
  id: number
  employeeNo: string
  name: string
  department: { name: string } | null
  position: { name: string } | null
  phone: string | null
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
        <Link href={`/master/karyawan/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
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
        viewHref={`/master/karyawan/${info.row.original.id}`}
        editHref={`/master/karyawan/${info.row.original.id}/ubah`}
        deleteAction={deleteEmployee}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface EmployeeTableProps {
  data: Employee[]
}

export function EmployeeTable({ data }: EmployeeTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar karyawan"
      pageSize={20}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari nama, NIP, atau telepon..."
      onBulkDelete={(ids) => bulkDelete("employee", ids)}
    />
  )
}

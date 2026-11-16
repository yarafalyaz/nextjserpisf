"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { entityHref } from "@/lib/utils/entity-url"

export interface DepartmentPositionRow {
  id: number
  slug: string | null
  name: string
}

const posColumnHelper = createColumnHelper<DepartmentPositionRow>()

const posColumns = [
  posColumnHelper.accessor("name", {
    header: "Nama Posisi",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/master/jabatan", info.row.original)} className="hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
]

export function DepartmentPositionsTable({ data }: { data: DepartmentPositionRow[] }) {
  return (
    <DataTable
      data={data}
      columns={posColumns}
      ariaLabel="Daftar posisi departemen"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface DepartmentEmployeeRow {
  id: number
  slug: string | null
  employeeNo: string
  name: string
  email: string | null
}

const empColumnHelper = createColumnHelper<DepartmentEmployeeRow>()

const empColumns = [
  empColumnHelper.accessor("employeeNo", {
    header: "No. Karyawan",
    cell: (info) => (
      <Link href={entityHref("/master/karyawan", info.row.original)} className="font-mono hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  empColumnHelper.accessor("name", {
    header: "Nama",
    meta: { mobilePrimary: true },
  }),
  empColumnHelper.accessor("email", {
    header: "Email",
    cell: (info) => info.getValue() || "-",
  }),
]

export function DepartmentEmployeesTable({ data }: { data: DepartmentEmployeeRow[] }) {
  return (
    <DataTable
      data={data}
      columns={empColumns}
      ariaLabel="Daftar karyawan departemen"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

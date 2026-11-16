"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { entityHref } from "@/lib/utils/entity-url"

export interface PositionEmployeeRow {
  id: number
  slug: string | null
  employeeNo: string
  name: string
  email: string | null
}

const columnHelper = createColumnHelper<PositionEmployeeRow>()

const columns = [
  columnHelper.accessor("employeeNo", {
    header: "No. Karyawan",
    cell: (info) => (
      <Link href={entityHref("/master/karyawan", info.row.original)} className="font-mono hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("name", {
    header: "Nama",
    meta: { mobilePrimary: true },
  }),
  columnHelper.accessor("email", {
    header: "Email",
    cell: (info) => info.getValue() || "-",
  }),
]

export function PositionEmployeesTable({ data }: { data: PositionEmployeeRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar karyawan jabatan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

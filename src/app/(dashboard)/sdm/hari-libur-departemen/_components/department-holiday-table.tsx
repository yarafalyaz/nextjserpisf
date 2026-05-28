"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteDepartmentHoliday } from "@/actions/hrm.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface DepartmentHolidayData {
  id: number
  name: string
  departmentName: string
  date: string
  isRecurring: boolean
}

const columnHelper = createColumnHelper<DepartmentHolidayData>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/sdm/hari-libur-departemen/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("departmentName", {
    header: "Departemen",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("isRecurring", {
    header: "Berulang",
    cell: (info) => (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${info.getValue() ? "bg-success/10 text-success" : "bg-default/10 text-muted"}`}>
        {info.getValue() ? "Ya" : "Tidak"}
      </span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/sdm/hari-libur-departemen/${info.row.original.id}`}
        editHref={`/sdm/hari-libur-departemen/${info.row.original.id}/ubah`}
        deleteAction={deleteDepartmentHoliday}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface DepartmentHolidayTableProps {
  data: DepartmentHolidayData[]
}

export function DepartmentHolidayTable({ data }: DepartmentHolidayTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar hari libur departemen"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("departmentHoliday", ids)}
    />
  )
}

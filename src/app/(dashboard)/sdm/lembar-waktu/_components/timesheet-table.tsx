"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteTimesheet } from "@/actions/hrm.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface Timesheet {
  id: number
  employee: { name: string }
  date: Date | string
  hours: number | string
  description: string | null
}

const columnHelper = createColumnHelper<Timesheet>()

const columns = [
  columnHelper.accessor((row) => row.employee.name, {
    id: "employeeName",
    header: "Karyawan",
    cell: (info) => (
      <Link href={`/sdm/lembar-waktu/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("hours", {
    header: "Jam",
    cell: (info) => Number(info.getValue()),
  }),
  columnHelper.accessor("description", {
    header: "Catatan",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/sdm/lembar-waktu/${info.row.original.id}`}
        deleteAction={deleteTimesheet}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface TimesheetTableProps {
  data: Timesheet[]
}

export function TimesheetTable({ data }: TimesheetTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar timesheet"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("timesheet", ids)}
    />
  )
}

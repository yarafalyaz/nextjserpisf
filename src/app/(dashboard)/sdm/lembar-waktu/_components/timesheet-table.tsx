"use client"

import { createColumnHelper } from "@/lib/table"
import { useMemo } from "react"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteTimesheet } from "@/actions/hrm.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref } from "@/lib/utils/entity-url"

interface Timesheet {
  id: number
  slug: string | null
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
      <Link href={entityHref("/sdm/lembar-waktu", info.row.original)} className="text-foreground hover:underline font-medium">
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
        viewHref={entityHref("/sdm/lembar-waktu", info.row.original)}
        deleteAction={deleteTimesheet}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface TimesheetTableProps {
  data: Timesheet[]
  total: number
  page: number
  pageSize: number
  showActions?: boolean
}

export function TimesheetTable({ data, total, page, pageSize, showActions = true }: TimesheetTableProps) {
  const visibleColumns = useMemo(() => {
    if (!showActions) return columns.filter((c: any) => c.id !== "actions")
    return columns
  }, [showActions])

  return (
    <DataTable
      data={data}
      columns={visibleColumns}
      ariaLabel="Daftar lembar waktu"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="employeeName"
      searchPlaceholder="Cari nama karyawan..."
      onBulkDelete={(ids) => bulkDelete("timesheet", ids)}
    />
  )
}

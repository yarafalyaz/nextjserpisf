"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteWorkSchedule } from "@/actions/hrm.actions"
import { bulkDelete } from "@/actions/bulk.actions"

interface WorkScheduleData {
  id: number
  name: string
  dayOfWeek: number
  startTime: string
  endTime: string
}

const DAY_NAMES: Record<number, string> = {
  0: "Minggu",
  1: "Senin",
  2: "Selasa",
  3: "Rabu",
  4: "Kamis",
  5: "Jumat",
  6: "Sabtu",
}

const columnHelper = createColumnHelper<WorkScheduleData>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/hrm/work-schedules/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("dayOfWeek", {
    header: "Hari",
    cell: (info) => DAY_NAMES[info.getValue()] || String(info.getValue()),
  }),
  columnHelper.accessor("startTime", {
    header: "Jam Masuk",
  }),
  columnHelper.accessor("endTime", {
    header: "Jam Keluar",
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/hrm/work-schedules/${info.row.original.id}`}
        deleteAction={deleteWorkSchedule}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface WorkScheduleTableProps {
  data: WorkScheduleData[]
}

export function WorkScheduleTable({ data }: WorkScheduleTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar jadwal kerja"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("workSchedule", ids)}
    />
  )
}

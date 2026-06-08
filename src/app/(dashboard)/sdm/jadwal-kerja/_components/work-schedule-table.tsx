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
  days: string
  startTime: string
  endTime: string
  assignment: string
  isActive: boolean
}

const columnHelper = createColumnHelper<WorkScheduleData>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link href={`/sdm/jadwal-kerja/${info.row.original.id}`} className="text-foreground hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("assignment", {
    header: "Berlaku Untuk",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("days", {
    header: "Hari Kerja",
    cell: (info) => info.getValue() || "-",
  }),
  columnHelper.accessor("startTime", {
    header: "Jam Masuk",
  }),
  columnHelper.accessor("endTime", {
    header: "Jam Keluar",
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) =>
      info.getValue() ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Aktif</span>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Nonaktif</span>
      ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/sdm/jadwal-kerja/${info.row.original.id}`}
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
      searchColumn="name"
      searchPlaceholder="Cari nama jadwal..."
      onBulkDelete={(ids) => bulkDelete("workSchedule", ids)}
    />
  )
}

"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteTask } from "@/actions/project.actions"
import { formatDate } from "@/lib/utils/format"

interface TaskData {
  id: number
  name: string
  project: { name: string }
  assignee: { name: string } | null
  status: string
  startDate: string | null
  dueDate: string | null
}

const columnHelper = createColumnHelper<TaskData>()

const columns = [
  columnHelper.display({
    id: "no",
    header: "No",
    cell: (info) => info.row.index + 1,
  }),
  columnHelper.accessor("name", {
    header: "Nama Tugas",
    cell: (info) => (
      <Link href={`/proyek/tugas/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("project.name", {
    header: "Proyek",
    cell: (info) => info.getValue(),
  }),
  columnHelper.display({
    id: "assignee",
    header: "Ditugaskan Ke",
    cell: (info) => info.row.original.assignee?.name || "-",
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  columnHelper.accessor("startDate", {
    header: "Tanggal Mulai",
    cell: (info) => {
      const val = info.getValue()
      return val ? formatDate(new Date(val)) : "-"
    },
  }),
  columnHelper.accessor("dueDate", {
    header: "Tenggat",
    cell: (info) => {
      const val = info.getValue()
      return val ? formatDate(new Date(val)) : "-"
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/proyek/tugas/${info.row.original.id}`}
        editHref={`/proyek/tugas/${info.row.original.id}/edit`}
        deleteAction={deleteTask}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface TaskTableProps {
  data: TaskData[]
}

export function TaskTable({ data }: TaskTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar tugas proyek"
      pageSize={20}
    />
  )
}

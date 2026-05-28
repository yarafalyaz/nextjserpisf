"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteProject } from "@/actions/project.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface ProjectData {
  id: number
  name: string | null
  documentNo: string | null
  customer: { name: string }
  startDate: string | null
  status: string
  _count?: { items: number }
}

const columnHelper = createColumnHelper<ProjectData>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => {
      const val = info.getValue()
      return val ? <span className="font-mono text-xs">{val}</span> : "-"
    },
  }),
  columnHelper.accessor("customer.name", {
    header: "Customer",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("name", {
    header: "Judul Proyek",
    cell: (info) => (
      <Link href={`/proyek/${info.row.original.id}`} className="text-primary hover:underline font-medium">
        {info.getValue() || "-"}
      </Link>
    ),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      return <StatusChip status={val} />
    },
  }),
  columnHelper.accessor("startDate", {
    header: "Mulai",
    cell: (info) => {
      const val = info.getValue()
      return val ? formatDate(new Date(val)) : "-"
    },
  }),
  columnHelper.display({
    id: "itemsCount",
    header: "Items",
    cell: (info) => info.row.original._count?.items ?? 0,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/projects/${info.row.original.id}`}
        editHref={`/projects/${info.row.original.id}/ubah`}
        deleteAction={deleteProject}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface ProjectTableProps {
  data: ProjectData[]
}

export function ProjectTable({ data }: ProjectTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar proyek"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("project", ids)}
    />
  )
}

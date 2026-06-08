"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { Badge } from "@/components/ui/shadcn/badge"
import { cn } from "@/lib/utils"
import { deleteApprovalWorkflow } from "@/actions/approval.actions"

interface WorkflowRow {
  id: number
  name: string
  modelType: string
  stepCount: number
  isActive: boolean
}

const columnHelper = createColumnHelper<WorkflowRow>()

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link
        href={`/pengaturan/workflow/${info.row.original.id}/ubah`}
        className="text-foreground hover:underline font-medium"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("modelType", {
    header: "Tipe Dokumen",
    cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
  }),
  columnHelper.accessor("stepCount", {
    header: "Jumlah Langkah",
    cell: (info) => `${info.getValue()} langkah`,
  }),
  columnHelper.accessor("isActive", {
    header: "Status",
    cell: (info) => {
      const active = info.getValue()
      return (
        <Badge
          variant="outline"
          className={cn(
            "font-medium border-transparent",
            active
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400"
              : "bg-muted text-muted-foreground"
          )}
        >
          {active ? "Aktif" : "Nonaktif"}
        </Badge>
      )
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/pengaturan/workflow/${info.row.original.id}/ubah`}
        editHref={`/pengaturan/workflow/${info.row.original.id}/ubah`}
        deleteAction={deleteApprovalWorkflow}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

export function WorkflowTable({ data }: { data: WorkflowRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar alur persetujuan"
      pageSize={20}
      selectable={false}
      searchColumn="name"
      searchPlaceholder="Cari nama workflow..."
    />
  )
}

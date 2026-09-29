"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate } from "@/lib/utils/format"
import { APPROVAL_MODEL_LABELS } from "@/lib/constants/approval"
import { bulkDelete } from "@/actions/bulk.actions"

interface ApprovalData {
  id: number
  workflowName: string
  referenceType: string
  referenceId: number
  currentStep: number
  status: string
  createdAt: string
}

const columnHelper = createColumnHelper<ApprovalData>()

const columns = [
  columnHelper.accessor("workflowName", {
    header: "Alur Kerja",
    cell: (info) => <span className="font-medium">{info.getValue()}</span>,
  }),
  columnHelper.accessor("referenceType", {
    header: "Referensi",
    cell: (info) => {
      const row = info.row.original
      return (
        <span className="font-mono text-xs">
          {APPROVAL_MODEL_LABELS[row.referenceType] || row.referenceType} #{row.referenceId}
        </span>
      )
    },
  }),
  columnHelper.accessor("currentStep", {
    header: "Langkah",
    cell: (info) => `Langkah ${info.getValue()}`,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  columnHelper.accessor("createdAt", {
    header: "Dibuat",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <Link
        href={`/pengaturan/persetujuan/${info.row.original.id}`}
        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-default text-foreground hover:bg-muted transition-all"
      >
        Lihat
      </Link>
    ),
  }),
]

interface ApprovalTableProps {
  data: ApprovalData[]
  filters?: React.ReactNode
}

export function ApprovalTable({ data, filters }: ApprovalTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar persetujuan"
      pageSize={20}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("approval", ids)}
    />
  )
}

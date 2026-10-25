"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { Badge } from "@/components/ui/shadcn/badge"
import { cn } from "@/lib/utils"
import { deleteApprovalWorkflow } from "@/actions/approval.actions"
import { APPROVAL_MODEL_LABELS } from "@/lib/constants/approval"
import { entityEditHref } from "@/lib/utils/entity-url"
import {
  isMoneyGateModelType,
  moneyGateConfirmBody,
  moneyGateConfirmTitle,
} from "./money-gate-warning"

interface WorkflowRow {
  id: number
  slug: string | null
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
        href={entityEditHref("/pengaturan/workflow", info.row.original)}
        className="text-foreground hover:underline font-medium"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("modelType", {
    header: "Tipe Dokumen",
    cell: (info) => <span>{APPROVAL_MODEL_LABELS[info.getValue()] || info.getValue()}</span>,
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
    cell: (info) => {
      const row = info.row.original
      // K4-S2(b) vonis 014-V: hapus workflow gerbang uang wajib peringatan eksplisit.
      const moneyGate = isMoneyGateModelType(row.modelType)
      return (
        <ActionDropdown
          viewHref={entityEditHref("/pengaturan/workflow", row)}
          editHref={entityEditHref("/pengaturan/workflow", row)}
          deleteAction={deleteApprovalWorkflow}
          deleteId={row.id}
          deleteConfirmTitle={moneyGate ? moneyGateConfirmTitle("delete") : undefined}
          deleteConfirmBody={moneyGate ? moneyGateConfirmBody("delete", row.modelType) : undefined}
        />
      )
    },
  }),
]

export function WorkflowTable({ data, total, page, pageSize }: { data: WorkflowRow[]; total: number; page: number; pageSize: number }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar alur persetujuan"
      serverPagination={{ total, page, pageSize }}
      selectable={false}
      searchColumn="name"
      searchPlaceholder="Cari nama alur persetujuan..."
    />
  )
}

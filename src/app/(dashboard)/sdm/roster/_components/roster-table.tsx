"use client"

import { useMemo } from "react"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { DeleteButton } from "@/components/ui/delete-button"
import { formatDate } from "@/lib/utils/format"
import { deleteEmployeeRoster } from "@/actions/hrm.actions"
import { RosterDecisionButtons, ROSTER_TYPE_LABELS } from "./roster-forms"

export interface RosterTableRow {
  id: number
  date: string
  employeeName: string
  type: string
  status: string
  notes: string | null
  approvedAt: string | null
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  approved: "Disetujui",
  rejected: "Ditolak",
}

const columnHelper = createColumnHelper<RosterTableRow>()

export function RosterTable({
  data,
  canEdit,
  canManage,
}: {
  data: RosterTableRow[]
  canEdit: boolean
  canManage: boolean
}) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("date", {
        header: "Tanggal",
        cell: (info) => (
          <span className="font-mono tabular-nums">{formatDate(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor("employeeName", {
        header: "Karyawan",
        meta: { mobilePrimary: true },
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor("type", {
        header: "Jenis",
        cell: (info) => ROSTER_TYPE_LABELS[info.getValue()] ?? info.getValue(),
      }),
      columnHelper.accessor("status", {
        header: "Status",
        cell: (info) => (
          <StatusChip
            status={info.getValue()}
            customLabel={STATUS_LABELS[info.getValue()] ?? info.getValue()}
          />
        ),
      }),
      columnHelper.accessor("notes", {
        header: "Catatan",
        cell: (info) => info.getValue() ?? "-",
      }),
      columnHelper.accessor("approvedAt", {
        header: "Disetujui",
        cell: (info) => {
          const val = info.getValue()
          return (
            <span className="font-mono tabular-nums">
              {val ? formatDate(val) : "-"}
            </span>
          )
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "Aksi",
        meta: { align: "right" },
        cell: (info) => {
          const row = info.row.original
          if (row.status !== "draft") return null
          return (
            <div className="flex items-center justify-end gap-2">
              {canEdit && <RosterDecisionButtons id={row.id} />}
              {canManage && <DeleteButton id={row.id} action={deleteEmployeeRoster} />}
            </div>
          )
        },
      }),
    ],
    [canEdit, canManage],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar roster karyawan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

"use client"

import { useMemo } from "react"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatDate } from "@/lib/utils/format"
import { LEAD_ACTIVITY_TYPE_LABELS, labelFrom, statusLabel } from "@/lib/utils/status-labels"
import { LeadActivityCompletionButton } from "../../_components/lead-actions"

export interface LeadActivityRow {
  id: number
  type: string
  oldStatus: string | null
  newStatus: string | null
  subject: string | null
  description: string | null
  notes: string | null
  createdAt: string
  scheduledAt: string | null
  completedAt: string | null
}

const columnHelper = createColumnHelper<LeadActivityRow>()

export function LeadActivitiesTable({
  data,
  leadId,
  canAct,
}: {
  data: LeadActivityRow[]
  leadId: number
  canAct: boolean
}) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("type", {
        header: "Tipe",
        cell: (info) => labelFrom(LEAD_ACTIVITY_TYPE_LABELS, info.getValue()),
      }),
      columnHelper.display({
        id: "subject",
        header: "Subjek",
        meta: { mobilePrimary: true },
        cell: (info) => {
          const activity = info.row.original
          return activity.type === "status_change"
            ? `${statusLabel(activity.oldStatus)} -> ${statusLabel(activity.newStatus)}`
            : activity.subject || "-"
        },
      }),
      columnHelper.display({
        id: "detail",
        header: "Detail",
        cell: (info) => {
          const activity = info.row.original
          return activity.description || activity.notes || "-"
        },
      }),
      columnHelper.accessor("createdAt", {
        header: "Tanggal",
        cell: (info) => formatDate(info.getValue()),
      }),
      columnHelper.display({
        id: "schedule",
        header: "Jadwal",
        cell: (info) => {
          const activity = info.row.original
          return activity.completedAt
            ? `Selesai ${formatDate(activity.completedAt)}`
            : activity.scheduledAt
              ? `Terjadwal ${formatDate(activity.scheduledAt)}`
              : "-"
        },
      }),
      columnHelper.display({
        id: "actions",
        header: "Aksi",
        enableSorting: false,
        cell: (info) => {
          const activity = info.row.original
          return activity.scheduledAt || activity.completedAt ? (
            <LeadActivityCompletionButton
              leadId={leadId}
              activityId={activity.id}
              subject={activity.subject}
              completedAt={Boolean(activity.completedAt)}
              canAct={canAct}
            />
          ) : null
        },
      }),
    ],
    [leadId, canAct],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Aktivitas prospek terbaru"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

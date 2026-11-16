"use client"

import { useMemo } from "react"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { ManagerReviewForm, SelfReviewForm } from "../../_components/cycle-actions"

export interface PerformanceCycleRow {
  id: number
  name: string
  departmentName: string | null
  goalCount: number
  selfScore: number | null
  managerScore: number | null
  finalScore: number | null
  reviewStatus: string
  isSelf: boolean
}

const REVIEW_STATUS_LABELS: Record<string, string> = {
  draft: "Belum dinilai",
  self_submitted: "Menunggu atasan",
  manager_reviewed: "Sudah diulas atasan",
  finalized: "Final",
}

const columnHelper = createColumnHelper<PerformanceCycleRow>()

export function PerformanceCycleTable({
  data,
  cycleId,
  scopeKind,
  canEdit,
}: {
  data: PerformanceCycleRow[]
  cycleId: number
  scopeKind: string
  canEdit: boolean
}) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Karyawan",
        meta: { mobilePrimary: true },
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor("departmentName", {
        header: "Departemen",
        cell: (info) => info.getValue() ?? "-",
      }),
      columnHelper.accessor("goalCount", {
        header: "Sasaran",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums">{info.getValue()}</span>
        ),
      }),
      columnHelper.accessor("selfScore", {
        header: "Skor Diri",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums">
            {info.getValue() != null ? info.getValue() : "-"}
          </span>
        ),
      }),
      columnHelper.accessor("managerScore", {
        header: "Skor Atasan",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums">
            {info.getValue() != null ? info.getValue() : "-"}
          </span>
        ),
      }),
      columnHelper.accessor("finalScore", {
        header: "Skor Final",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums">
            {info.getValue() != null ? info.getValue() : "-"}
          </span>
        ),
      }),
      columnHelper.accessor("reviewStatus", {
        header: "Status",
        cell: (info) => (
          <StatusChip
            status={info.getValue()}
            customLabel={REVIEW_STATUS_LABELS[info.getValue()] ?? info.getValue()}
          />
        ),
      }),
      columnHelper.display({
        id: "actions",
        header: "Nilai",
        cell: (info) => {
          const row = info.row.original
          if (row.reviewStatus === "finalized") return "-"
          if (row.isSelf) {
            return <SelfReviewForm cycleId={cycleId} employeeId={row.id} />
          }
          if (scopeKind !== "self") {
            return (
              <ManagerReviewForm
                cycleId={cycleId}
                employeeId={row.id}
                canEdit={canEdit}
              />
            )
          }
          return "-"
        },
      }),
    ],
    [canEdit, cycleId, scopeKind],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar penilaian kinerja karyawan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

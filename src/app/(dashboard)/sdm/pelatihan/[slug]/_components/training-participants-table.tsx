"use client"

import { useMemo } from "react"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { ParticipantResultButtons } from "../../_components/training-actions"

export interface TrainingParticipantRow {
  id: number
  employeeName: string
  employeeNo: string
  status: string
  score: number | null
  certificateRef: string | null
}

const PARTICIPANT_STATUS_LABELS: Record<string, string> = {
  registered: "Terdaftar",
  attended: "Hadir",
  absent: "Absen",
}

const columnHelper = createColumnHelper<TrainingParticipantRow>()

export function TrainingParticipantsTable({
  data,
  canEdit,
}: {
  data: TrainingParticipantRow[]
  canEdit: boolean
}) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("employeeName", {
        header: "Karyawan",
        meta: { mobilePrimary: true },
        cell: (info) => <span className="font-medium">{info.getValue()}</span>,
      }),
      columnHelper.accessor("employeeNo", {
        header: "NIP",
        cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
      }),
      columnHelper.accessor("status", {
        header: "Kehadiran",
        cell: (info) => (
          <StatusChip
            status={info.getValue()}
            customLabel={
              PARTICIPANT_STATUS_LABELS[info.getValue()] ?? info.getValue()
            }
          />
        ),
      }),
      columnHelper.accessor("score", {
        header: "Skor",
        meta: { align: "right" },
        cell: (info) => (
          <span className="font-mono tabular-nums">
            {info.getValue() != null ? info.getValue() : "-"}
          </span>
        ),
      }),
      columnHelper.accessor("certificateRef", {
        header: "Sertifikat",
        cell: (info) => info.getValue() ?? "-",
      }),
      columnHelper.display({
        id: "actions",
        header: "Hasil",
        cell: (info) => (
          <ParticipantResultButtons
            participantId={info.row.original.id}
            canEdit={canEdit}
          />
        ),
      }),
    ],
    [canEdit],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar peserta pelatihan"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

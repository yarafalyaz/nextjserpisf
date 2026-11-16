"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate } from "@/lib/utils/format"
import {
  taxDisputeStatusLabel,
  TAX_DISPUTE_STEP_KIND_LABELS,
  TAX_DISPUTE_PASAL36_SUBKIND_LABELS,
} from "../../_components/tax-dispute-labels"

export interface TaxDisputeStepRow {
  id: number
  kind: string
  article36Subkind: string | null
  filedAt: string | null
  decidedAt: string | null
  result: string | null
  status: string
  lateReason: string | null
}

const RESULT_LABELS: Record<string, string> = {
  DIKABULKAN: "Dikabulkan",
  DIKABULKAN_SEBAGIAN: "Dikabulkan Sebagian",
  DITOLAK: "Ditolak",
  TIDAK_DAPAT_DITERIMA: "Tidak Dapat Diterima",
}

const columnHelper = createColumnHelper<TaxDisputeStepRow>()

const columns = [
  columnHelper.accessor("kind", {
    header: "Jenis Upaya",
    meta: { mobilePrimary: true },
    cell: (info) => TAX_DISPUTE_STEP_KIND_LABELS[info.getValue()] ?? info.getValue(),
  }),
  columnHelper.accessor("article36Subkind", {
    header: "Sub-jenis Pasal 36",
    cell: (info) => {
      const val = info.getValue()
      return val ? (TAX_DISPUTE_PASAL36_SUBKIND_LABELS[val] ?? val) : "-"
    },
  }),
  columnHelper.accessor("filedAt", {
    header: "Tanggal Pengajuan",
    cell: (info) => {
      const val = info.getValue()
      return (
        <span className="font-mono tabular-nums">
          {val ? formatDate(val) : "-"}
        </span>
      )
    },
  }),
  columnHelper.accessor("decidedAt", {
    header: "Tanggal Putusan",
    cell: (info) => {
      const val = info.getValue()
      return (
        <span className="font-mono tabular-nums">
          {val ? formatDate(val) : "-"}
        </span>
      )
    },
  }),
  columnHelper.accessor("result", {
    header: "Hasil",
    cell: (info) => {
      const val = info.getValue()
      return val ? (RESULT_LABELS[val] ?? val) : "-"
    },
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const row = info.row.original
      return (
        <div>
          <StatusChip status={row.status} customLabel={taxDisputeStatusLabel(row.status)} />
          {row.lateReason && (
            <p className="mt-1 text-xs text-muted-foreground">
              Lewat tenggat: {row.lateReason}
            </p>
          )}
        </div>
      )
    },
  }),
]

export function TaxDisputeStepsTable({ data }: { data: TaxDisputeStepRow[] }) {
  return (
    <div className="rounded-xl border border-default bg-surface p-4 shadow-sm">
      <DataTable
        data={data}
        columns={columns}
        ariaLabel="Daftar upaya sengketa"
        selectable={false}
        enableColumnToggle={false}
        enableExport={false}
        pageSize={50}
      />
    </div>
  )
}

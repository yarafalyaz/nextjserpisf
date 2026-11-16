"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import { SEVERITY_LABELS, labelFrom } from "@/lib/utils/status-labels"

export interface QcInspectionResultRow {
  id: number
  itemName: string
  spec: string | null
  result: string
  measuredValue: string | null
  notes: string | null
}

export interface QcInspectionNcrRow {
  id: number
  slug: string | null
  documentNo: string
  status: string
  severity: string
}

const RESULT_LABELS: Record<string, string> = {
  pass: "Lulus",
  fail: "Gagal",
  na: "N/A",
}

const resultColumnHelper = createColumnHelper<QcInspectionResultRow>()

const resultColumns = [
  resultColumnHelper.accessor("itemName", {
    header: "Butir",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
  }),
  resultColumnHelper.accessor("spec", {
    header: "Spesifikasi",
    cell: (info) => (
      <span className="text-muted-foreground">{info.getValue() ?? "-"}</span>
    ),
  }),
  resultColumnHelper.accessor("result", {
    header: "Hasil",
    cell: (info) => {
      const val = info.getValue()
      return (
        <span
          className={
            val === "fail"
              ? "text-danger-600 font-medium"
              : val === "pass"
                ? "text-success-600 font-medium"
                : "text-muted-foreground"
          }
        >
          {RESULT_LABELS[val] ?? val}
        </span>
      )
    },
  }),
  resultColumnHelper.accessor("measuredValue", {
    header: "Nilai Ukur",
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {info.getValue() ?? "-"}
      </span>
    ),
  }),
  resultColumnHelper.accessor("notes", {
    header: "Catatan",
    cell: (info) => (
      <span className="text-muted-foreground">{info.getValue() ?? "-"}</span>
    ),
  }),
]

export function QcInspectionResultsTable({ data }: { data: QcInspectionResultRow[] }) {
  return (
    <DataTable
      data={data}
      columns={resultColumns}
      ariaLabel="Hasil Pemeriksaan QC"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const ncrColumnHelper = createColumnHelper<QcInspectionNcrRow>()

const ncrColumns = [
  ncrColumnHelper.accessor("documentNo", {
    header: "No. NCR",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return (
        <Link
          href={entityHref("/produksi/qc/ncr", row)}
          className="font-mono font-medium text-primary hover:underline"
        >
          {row.documentNo}
        </Link>
      )
    },
  }),
  ncrColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  ncrColumnHelper.accessor("severity", {
    header: "Tingkat Keparahan",
    cell: (info) => (
      <span className="text-foreground">{labelFrom(SEVERITY_LABELS, info.getValue())}</span>
    ),
  }),
]

export function QcInspectionNcrTable({ data }: { data: QcInspectionNcrRow[] }) {
  return (
    <DataTable
      data={data}
      columns={ncrColumns}
      ariaLabel="Ketidaksesuaian Terkait"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate } from "@/lib/utils/format"

export interface QcInspectionRow {
  id: number
  documentNo: string
  inspectionType: string
  referenceType: string
  referenceId: number
  status: string
  inspectedAt: string | null
  checklistName: string
  resultsCount: number
}

const columnHelper = createColumnHelper<QcInspectionRow>()

const TYPE_LABELS: Record<string, string> = {
  incoming: "Penerimaan",
  in_process: "Proses",
  final: "Akhir",
}

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link
        href={`/produksi/qc/inspeksi/${info.row.original.id}`}
        className="text-foreground hover:underline font-medium font-mono"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("checklistName", {
    header: "Checklist",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("inspectionType", {
    header: "Jenis",
    cell: (info) => TYPE_LABELS[info.getValue()] ?? info.getValue(),
  }),
  columnHelper.display({
    id: "reference",
    header: "Referensi",
    cell: (info) => `${info.row.original.referenceType} #${info.row.original.referenceId}`,
  }),
  columnHelper.accessor("status", {
    header: "Hasil",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  columnHelper.accessor("inspectedAt", {
    header: "Diinspeksi",
    cell: (info) => (info.getValue() ? formatDate(info.getValue()!) : "-"),
  }),
]

export function QcInspectionTable({ data }: { data: QcInspectionRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar inspeksi QC"
      pageSize={20}
      searchColumn="documentNo"
      searchPlaceholder="Cari no. dokumen..."
    />
  )
}

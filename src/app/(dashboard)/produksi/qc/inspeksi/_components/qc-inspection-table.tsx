"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"

export interface QcInspectionRow {
  id: number
  documentNo: string
  slug: string | null
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
  safety: "Keselamatan",
  vehicle_intake: "Inspeksi Masuk Kendaraan",
  vehicle_handover: "Serah Terima Kendaraan",
}

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link
        href={entityHref("/produksi/qc/inspeksi", info.row.original)}
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

export function QcInspectionTable({ data, total, page, pageSize }: { data: QcInspectionRow[]; total: number; page: number; pageSize: number }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar inspeksi QC"
      serverPagination={{ total, page, pageSize }}
      searchColumn="documentNo"
      searchPlaceholder="Cari no. dokumen..."
    />
  )
}

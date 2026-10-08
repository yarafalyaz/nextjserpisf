"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate } from "@/lib/utils/format"

export interface NonconformanceRow {
  id: number
  documentNo: string
  referenceType: string
  referenceId: number
  severity: string
  responsibility: string
  status: string
  createdAt: string
}

const columnHelper = createColumnHelper<NonconformanceRow>()

const SEVERITY_LABELS: Record<string, string> = {
  minor: "Ringan",
  major: "Berat",
  critical: "Kritis",
}

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. NCR",
    cell: (info) => (
      <Link
        href={`/produksi/qc/ncr/${info.row.original.id}`}
        className="text-foreground hover:underline font-medium font-mono"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.display({
    id: "reference",
    header: "Referensi",
    cell: (info) => `${info.row.original.referenceType} #${info.row.original.referenceId}`,
  }),
  columnHelper.accessor("severity", {
    header: "Severity",
    cell: (info) => SEVERITY_LABELS[info.getValue()] ?? info.getValue(),
  }),
  columnHelper.accessor("responsibility", {
    header: "Penanggung",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  columnHelper.accessor("createdAt", {
    header: "Dibuat",
    cell: (info) => formatDate(info.getValue()),
  }),
]

export function NonconformanceTable({ data }: { data: NonconformanceRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar nonconformance"
      pageSize={20}
      searchColumn="documentNo"
      searchPlaceholder="Cari no. NCR..."
    />
  )
}

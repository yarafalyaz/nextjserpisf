"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { QcChecklistActions } from "./qc-checklist-actions"

export interface QcChecklistRow {
  id: number
  code: string | null
  name: string
  checklistType: string
  version: number
  status: string
  itemsCount: number
}

const columnHelper = createColumnHelper<QcChecklistRow>()

const TYPE_LABELS: Record<string, string> = {
  incoming: "Penerimaan",
  in_process: "Proses",
  final: "Akhir",
  safety: "Keselamatan",
}

const columns = [
  columnHelper.accessor("name", {
    header: "Nama",
    cell: (info) => (
      <Link
        href={`/produksi/qc/checklist/${info.row.original.id}`}
        className="text-foreground hover:underline font-medium"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => <span className="font-mono">{info.getValue() ?? "-"}</span>,
  }),
  columnHelper.accessor("checklistType", {
    header: "Jenis",
    cell: (info) => TYPE_LABELS[info.getValue()] ?? info.getValue(),
  }),
  columnHelper.accessor("version", {
    header: "Versi",
    cell: (info) => `v${info.getValue()}`,
  }),
  columnHelper.accessor("itemsCount", {
    header: "Item",
    cell: (info) => `${info.getValue()} item`,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => <QcChecklistActions checklist={info.row.original} />,
  }),
]

export function QcChecklistTable({ data }: { data: QcChecklistRow[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar checklist QC"
      pageSize={20}
      searchColumn="name"
      searchPlaceholder="Cari checklist..."
    />
  )
}

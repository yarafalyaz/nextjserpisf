"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"

export interface RackRowItem {
  id: number
  slug: string | null
  code: string | null
  name: string
  createdAt: string
}

const columnHelper = createColumnHelper<RackRowItem>()

const columns = [
  columnHelper.display({
    id: "no",
    header: "No",
    cell: (info) => (
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {info.row.index + 1}
      </span>
    ),
  }),
  columnHelper.accessor("code", {
    header: "Kode Baris",
    cell: (info) => {
      const row = info.row.original
      return (
        <Link
          href={entityHref("/inventaris/baris-rak", row)}
          className="font-mono text-xs font-medium tabular-nums text-foreground hover:text-primary hover:underline"
        >
          {row.code || "-"}
        </Link>
      )
    },
  }),
  columnHelper.accessor("name", {
    header: "Nama Baris Rak",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return (
        <Link
          href={entityHref("/inventaris/baris-rak", row)}
          className="text-foreground hover:text-primary hover:underline font-medium"
        >
          {row.name}
        </Link>
      )
    },
  }),
  columnHelper.accessor("createdAt", {
    header: "Tanggal Dibuat",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono text-xs text-muted-foreground tabular-nums">
        {formatDate(info.getValue())}
      </span>
    ),
  }),
]

export function RackRowsTable({ data }: { data: RackRowItem[] }) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar Baris Rak"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

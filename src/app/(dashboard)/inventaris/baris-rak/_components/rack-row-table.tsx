"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteRackRow } from "@/actions/inventory.actions"
import { formatDate } from "@/lib/utils/format"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"

interface RackRowData {
  id: number
  code: string | null
  name: string
  slug: string | null
  createdAt: string
  activeSkuCount?: number
  rack: {
    id: number
    code?: string | null
    name: string
    slug?: string | null
    warehouse: {
      id: number
      name: string
      slug?: string | null
      code?: string | null
    }
  }
}

const columnHelper = createColumnHelper<RackRowData>()

const columns = [
  columnHelper.accessor("code", {
    header: "Kode Baris",
    cell: (info) => (
      <Link
        href={entityHref("/inventaris/baris-rak", info.row.original)}
        className="font-mono text-xs font-medium text-foreground hover:text-primary hover:underline tabular-nums"
      >
        {info.getValue() || "-"}
      </Link>
    ),
  }),
  columnHelper.accessor("name", {
    header: "Nama Baris Rak",
    // The row name (linked) is the card's headline; the code becomes a detail line.
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link
        href={entityHref("/inventaris/baris-rak", info.row.original)}
        className="text-foreground hover:text-primary hover:underline font-medium"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("rack.name", {
    header: "Rak Induk",
    cell: (info) => {
      const rack = info.row.original.rack
      return (
        <div className="flex items-center gap-2">
          <Link
            href={entityHref("/inventaris/rak", rack)}
            className="text-foreground hover:text-primary hover:underline"
          >
            {rack.name}
          </Link>
          {rack.code && (
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground tabular-nums">
              {rack.code}
            </span>
          )}
        </div>
      )
    },
  }),
  columnHelper.accessor("rack.warehouse.name", {
    header: "Gudang",
    cell: (info) => {
      const wh = info.row.original.rack.warehouse
      return (
        <div className="flex items-center gap-2">
          <Link
            href={entityHref("/master/gudang", wh)}
            className="text-foreground hover:text-primary hover:underline"
          >
            {wh.name}
          </Link>
          {wh.code && (
            <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground tabular-nums">
              {wh.code}
            </span>
          )}
        </div>
      )
    },
  }),
  columnHelper.accessor("activeSkuCount", {
    header: "Okupansi Stok",
    meta: { align: "right" },
    cell: (info) => {
      const count = info.getValue() ?? 0
      if (count > 0) {
        return (
          <div className="flex items-center justify-end gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
              {count} SKU
            </span>
          </div>
        )
      }
      return (
        <div className="flex items-center justify-end">
          <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
            Kosong
          </span>
        </div>
      )
    },
  }),
  columnHelper.accessor("createdAt", {
    id: "createdAt",
    header: "Dibuat",
    cell: (info) => (
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatDate(info.getValue())}
      </span>
    ),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/inventaris/baris-rak", info.row.original)}
        editHref={entityEditHref("/inventaris/baris-rak", info.row.original)}
        deleteAction={deleteRackRow}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface RackRowTableProps {
  data: RackRowData[]
  total: number
  page: number
  pageSize: number
}

export function RackRowTable({ data, total, page, pageSize }: RackRowTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar baris rak"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari kode, nama baris, rak, atau gudang..."
      initialColumnVisibility={{ createdAt: false }}
    />
  )
}

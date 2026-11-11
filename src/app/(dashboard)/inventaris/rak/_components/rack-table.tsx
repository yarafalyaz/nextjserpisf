"use client"

import { createColumnHelper } from "@/lib/table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteRack } from "@/actions/inventory.actions"
import { entityHref, entityEditHref } from "@/lib/utils/entity-url"
import { formatDate } from "@/lib/utils/format"

interface Warehouse {
  id: number
  name: string
  slug?: string | null
  code?: string | null
}

interface RackRow {
  id: number
}

interface Rack {
  id: number
  code?: string | null
  name: string
  slug: string | null
  createdAt?: string | Date
  warehouse: Warehouse
  rows: RackRow[]
}

const columnHelper = createColumnHelper<Rack>()

const columns = [
  columnHelper.accessor("code", {
    header: "Kode Rak",
    cell: (info) => (
      <Link
        href={entityHref("/inventaris/rak", info.row.original)}
        className="font-mono text-xs font-medium text-foreground hover:text-primary hover:underline tabular-nums"
      >
        {info.getValue() || "-"}
      </Link>
    ),
  }),
  columnHelper.accessor("name", {
    header: "Nama Rak",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link
        href={entityHref("/inventaris/rak", info.row.original)}
        className="text-foreground hover:text-primary hover:underline font-medium"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("warehouse.name", {
    header: "Gudang",
    cell: (info) => {
      const wh = info.row.original.warehouse
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
  columnHelper.accessor("rows", {
    header: "Kapasitas Baris",
    meta: { align: "right" },
    cell: (info) => {
      const count = info.getValue().length
      return (
        <div className="flex items-center justify-end gap-1.5">
          <span className="font-mono font-semibold tabular-nums text-foreground">
            {count}
          </span>
          <span className="inline-flex items-center rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">
            baris
          </span>
        </div>
      )
    },
  }),
  columnHelper.accessor("createdAt", {
    id: "createdAt",
    header: "Dibuat",
    cell: (info) => {
      const val = info.getValue()
      return (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {val ? formatDate(val) : "-"}
        </span>
      )
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/inventaris/rak", info.row.original)}
        editHref={entityEditHref("/inventaris/rak", info.row.original)}
        deleteAction={deleteRack}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface RackTableProps {
  data: Rack[]
  total: number
  page: number
  pageSize: number
}

export function RackTable({ data, total, page, pageSize }: RackTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar rak gudang"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="name"
      searchPlaceholder="Cari kode, nama rak, atau gudang..."
      initialColumnVisibility={{ createdAt: false }}
    />
  )
}

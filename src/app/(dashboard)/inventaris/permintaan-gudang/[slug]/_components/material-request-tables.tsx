"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatNumber } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"

export interface MaterialRequestItemRow {
  id: number
  itemName: string
  sku: string | null
  unitOfMeasure: string
  requestedQty: number
  receivedQty: number
  remainingQty: number
  notes: string | null
}

export interface MaterialRequestTransferRow {
  id: number
  slug: string | null
  documentNo: string
  status: string
}

const itemColumnHelper = createColumnHelper<MaterialRequestItemRow>()

const itemColumns = [
  itemColumnHelper.accessor("itemName", {
    header: "Nama Barang",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return (
        <div>
          <div className="font-medium text-foreground">{row.itemName}</div>
          {row.sku && (
            <div className="font-mono text-xs text-muted-foreground mt-0.5">{row.sku}</div>
          )}
        </div>
      )
    },
  }),
  itemColumnHelper.accessor("unitOfMeasure", {
    header: "Satuan",
    cell: (info) => <span className="text-foreground">{info.getValue()}</span>,
  }),
  itemColumnHelper.accessor("requestedQty", {
    header: "Diminta",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums font-medium text-foreground">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
  itemColumnHelper.accessor("receivedQty", {
    header: "Diterima",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
  itemColumnHelper.accessor("remainingQty", {
    header: "Sisa",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
  itemColumnHelper.accessor("notes", {
    header: "Catatan",
    cell: (info) => (
      <span className="text-muted-foreground">{info.getValue() || "-"}</span>
    ),
  }),
]

export function MaterialRequestItemsTable({ data }: { data: MaterialRequestItemRow[] }) {
  return (
    <DataTable
      data={data}
      columns={itemColumns}
      ariaLabel="Daftar Barang Permintaan Gudang"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const transferColumnHelper = createColumnHelper<MaterialRequestTransferRow>()

const transferColumns = [
  transferColumnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return (
        <Link
          href={entityHref("/inventaris/transfer", row)}
          className="font-mono font-medium text-primary hover:underline"
        >
          {row.documentNo}
        </Link>
      )
    },
  }),
  transferColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function MaterialRequestTransfersTable({ data }: { data: MaterialRequestTransferRow[] }) {
  return (
    <DataTable
      data={data}
      columns={transferColumns}
      ariaLabel="Daftar Transfer Tertaut"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

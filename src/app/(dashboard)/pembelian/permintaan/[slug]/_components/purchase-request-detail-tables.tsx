"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import { formatDate } from "@/lib/utils/format"

export interface PurchaseRequestItemRow {
  id: number
  itemId: number
  itemName: string | null
  itemCode: string | null
  qty: number
  unitOfMeasure: string | null
  notes: string | null
}

export interface PurchaseRequestOrderRow {
  id: number
  slug: string | null
  documentNo: string
  date: string
  status: string
}

const itemHelper = createColumnHelper<PurchaseRequestItemRow>()
const itemColumns = [
  itemHelper.display({
    id: "item",
    header: "Barang",
    meta: { mobilePrimary: true },
    cell: (info) => {
      const row = info.row.original
      return row.itemName ? (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.itemName}</span>
          {row.itemCode && (
            <span className="text-xs text-muted-foreground font-mono">{row.itemCode}</span>
          )}
        </div>
      ) : (
        `Item #${row.itemId}`
      )
    },
  }),
  itemHelper.accessor("qty", {
    header: "Jml",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  itemHelper.accessor("unitOfMeasure", {
    header: "Satuan",
    cell: (info) => info.getValue() || "-",
  }),
  itemHelper.accessor("notes", {
    header: "Catatan",
    cell: (info) => info.getValue() || "-",
  }),
]

export function PurchaseRequestItemsTable({
  data,
}: Readonly<{ data: PurchaseRequestItemRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={itemColumns}
      ariaLabel="Item Permintaan Pembelian"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const poHelper = createColumnHelper<PurchaseRequestOrderRow>()
const poColumns = [
  poHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link
        href={entityHref("/pembelian/pesanan", info.row.original)}
        className="font-mono font-medium text-foreground hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  poHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  poHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function PurchaseRequestOrdersTable({
  data,
}: Readonly<{ data: PurchaseRequestOrderRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={poColumns}
      ariaLabel="Pesanan Pembelian Terkait"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

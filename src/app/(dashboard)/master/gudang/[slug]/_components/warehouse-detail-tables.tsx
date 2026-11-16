"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"

export interface WarehouseRackRow {
  id: number
  code: string
  name: string
  rowsCount: number
}

const rackColumnHelper = createColumnHelper<WarehouseRackRow>()

const rackColumns = [
  rackColumnHelper.accessor("code", {
    header: "Kode",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  rackColumnHelper.accessor("name", {
    header: "Nama",
    meta: { mobilePrimary: true },
  }),
  rackColumnHelper.accessor("rowsCount", {
    header: "Jumlah Baris",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">{info.getValue()}</div>
    ),
  }),
]

export function WarehouseRacksTable({ data }: { data: WarehouseRackRow[] }) {
  return (
    <DataTable
      data={data}
      columns={rackColumns}
      ariaLabel="Daftar rak gudang"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface WarehouseStockMoveRow {
  id: number
  documentNo: string
  item: {
    id: number
    slug: string | null
    name: string
  }
  impact: string
  qty: number
  createdAt: string
}

const moveColumnHelper = createColumnHelper<WarehouseStockMoveRow>()

const moveColumns = [
  moveColumnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  moveColumnHelper.accessor((row) => row.item.name, {
    id: "itemName",
    header: "Barang",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/master/barang", info.row.original.item)} className="hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  moveColumnHelper.accessor("impact", {
    header: "Dampak",
    cell: (info) => <StatusChip status={info.getValue() === "IN" ? "received" : "returned"} />,
  }),
  moveColumnHelper.accessor("qty", {
    header: "Jml",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">{info.getValue()}</div>
    ),
  }),
  moveColumnHelper.accessor("createdAt", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
]

export function WarehouseStockMovesTable({ data }: { data: WarehouseStockMoveRow[] }) {
  return (
    <DataTable
      data={data}
      columns={moveColumns}
      ariaLabel="Riwayat mutasi stok gudang"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

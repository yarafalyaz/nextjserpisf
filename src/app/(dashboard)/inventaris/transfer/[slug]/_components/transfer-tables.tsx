"use client"

import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { formatDate, formatNumber } from "@/lib/utils/format"

export interface TransferItemRow {
  id: number
  itemName: string
  unit: string
  qty: number
  receivedQty: number
  remainingQty: number
}

export interface TransferReceiptHistoryRow {
  id: number
  receivedDate: string
  itemName: string
  qty: number
}

const itemColumnHelper = createColumnHelper<TransferItemRow>()

const itemColumns = [
  itemColumnHelper.accessor("itemName", {
    header: "Nama Barang",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
  }),
  itemColumnHelper.accessor("qty", {
    header: "Terkirim",
    meta: { align: "right" },
    cell: (info) => {
      const row = info.row.original
      return (
        <span className="font-mono tabular-nums text-foreground">
          {formatNumber(row.qty)} {row.unit}
        </span>
      )
    },
  }),
  itemColumnHelper.accessor("receivedQty", {
    header: "Sudah Diterima",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
  itemColumnHelper.accessor("remainingQty", {
    header: "Belum Diterima",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
]

export function TransferItemsTable({ data }: { data: TransferItemRow[] }) {
  return (
    <DataTable
      data={data}
      columns={itemColumns}
      ariaLabel="Daftar Barang Transfer"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const receiptColumnHelper = createColumnHelper<TransferReceiptHistoryRow>()

const receiptColumns = [
  receiptColumnHelper.accessor("receivedDate", {
    header: "Tanggal Terima",
    cell: (info) => (
      <span className="tabular-nums text-foreground">{formatDate(info.getValue())}</span>
    ),
  }),
  receiptColumnHelper.accessor("itemName", {
    header: "Barang",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-medium text-foreground">{info.getValue()}</span>,
  }),
  receiptColumnHelper.accessor("qty", {
    header: "Qty Diterima",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums text-foreground">
        {formatNumber(info.getValue())}
      </span>
    ),
  }),
]

export function TransferReceiptHistoryTable({ data }: { data: TransferReceiptHistoryRow[] }) {
  return (
    <DataTable
      data={data}
      columns={receiptColumns}
      ariaLabel="Riwayat Penerimaan Transfer"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

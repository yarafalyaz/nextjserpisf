"use client"

import Link from "next/link"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"

export interface PurchaseOrderItemRow {
  id: number
  itemName: string
  qty: number
  receivedQty: number
  unitPrice: number
  total: number
}

export interface PurchaseOrderReceiptRow {
  id: number
  slug: string | null
  documentNo: string
  date: string
  itemCount: number
  status: string
}

export interface PurchaseOrderReturnRow {
  id: number
  slug: string | null
  documentNo: string
  date: string
  itemCount: number
  status: string
}

export interface PurchaseOrderBillRow {
  id: number
  slug: string | null
  documentNo: string
  grandTotal: number
}

const itemHelper = createColumnHelper<PurchaseOrderItemRow>()
const itemColumns = [
  itemHelper.accessor("itemName", {
    header: "Nama Barang",
    meta: { mobilePrimary: true },
  }),
  itemHelper.accessor("qty", {
    header: "Jml",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  itemHelper.accessor("receivedQty", {
    header: "Diterima",
    meta: { align: "right" },
    cell: (info) => <span className="font-mono tabular-nums">{info.getValue()}</span>,
  }),
  itemHelper.accessor("unitPrice", {
    header: "Harga",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
  itemHelper.accessor("total", {
    header: "Total",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
]

export function PurchaseOrderItemsTable({
  data,
  grandTotal,
}: Readonly<{ data: PurchaseOrderItemRow[]; grandTotal: number }>) {
  return (
    <div className="space-y-3">
      <DataTable
        data={data}
        columns={itemColumns}
        ariaLabel="Barang Pesanan Pembelian"
        selectable={false}
        enableColumnToggle={false}
        enableExport={false}
        pageSize={50}
      />
      <div className="flex items-center justify-between rounded-lg border border-default bg-surface-secondary/40 px-4 py-3 text-sm font-bold">
        <span>Total Keseluruhan</span>
        <span className="font-mono tabular-nums">{formatCurrencyExact(grandTotal)}</span>
      </div>
    </div>
  )
}

const grHelper = createColumnHelper<PurchaseOrderReceiptRow>()
const grColumns = [
  grHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link
        href={entityHref("/pembelian/penerimaan", info.row.original)}
        className="font-mono font-medium text-foreground hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  grHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  grHelper.accessor("itemCount", {
    header: "Barang",
    cell: (info) => `${info.getValue()} item`,
  }),
  grHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function PurchaseOrderReceiptsTable({
  data,
}: Readonly<{ data: PurchaseOrderReceiptRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={grColumns}
      ariaLabel="Penerimaan Barang"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const retHelper = createColumnHelper<PurchaseOrderReturnRow>()
const retColumns = [
  retHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link
        href={entityHref("/pembelian/retur", info.row.original)}
        className="font-mono font-medium text-foreground hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  retHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  retHelper.accessor("itemCount", {
    header: "Barang",
    cell: (info) => `${info.getValue()} item`,
  }),
  retHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function PurchaseOrderReturnsTable({
  data,
}: Readonly<{ data: PurchaseOrderReturnRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={retColumns}
      ariaLabel="Retur Pembelian"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

const billHelper = createColumnHelper<PurchaseOrderBillRow>()
const billColumns = [
  billHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link
        href={entityHref("/pembelian/tagihan", info.row.original)}
        className="font-mono font-medium text-foreground hover:underline"
      >
        {info.getValue()}
      </Link>
    ),
  }),
  billHelper.accessor("grandTotal", {
    header: "Total",
    meta: { align: "right" },
    cell: (info) => (
      <span className="font-mono tabular-nums">{formatCurrencyExact(info.getValue())}</span>
    ),
  }),
]

export function PurchaseOrderBillsTable({
  data,
}: Readonly<{ data: PurchaseOrderBillRow[] }>) {
  return (
    <DataTable
      data={data}
      columns={billColumns}
      ariaLabel="Tagihan Pemasok"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

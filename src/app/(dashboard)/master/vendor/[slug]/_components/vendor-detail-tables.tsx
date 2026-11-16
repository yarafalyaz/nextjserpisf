"use client"

import { useMemo } from "react"
import Link from "next/link"
import { createColumnHelper, type ErpColumnDef } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { formatCurrencyExact, formatDate } from "@/lib/utils/format"
import { entityHref } from "@/lib/utils/entity-url"

export interface VendorPurchaseOrderRow {
  id: number
  slug: string | null
  documentNo: string
  date: string
  grandTotal: number
  grandTotalFormatted?: string
  status: string
}

const poColumnHelper = createColumnHelper<VendorPurchaseOrderRow>()

const poColumns = [
  poColumnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/pembelian/pesanan", info.row.original)} className="font-mono hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  poColumnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  poColumnHelper.accessor("grandTotal", {
    header: "Total",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">
        {info.row.original.grandTotalFormatted ?? formatCurrencyExact(info.getValue())}
      </div>
    ),
  }),
  poColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function VendorPurchaseOrdersTable({ data }: { data: VendorPurchaseOrderRow[] }) {
  return (
    <DataTable
      data={data}
      columns={poColumns}
      ariaLabel="Pesanan pembelian pemasok"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface VendorGoodsReceiptRow {
  id: number
  documentNo: string
  date: string
  purchaseOrder: {
    id: number
    slug: string | null
    documentNo: string
  }
  warehouseName: string | null
  status: string
}

const grColumnHelper = createColumnHelper<VendorGoodsReceiptRow>()

const grColumns = [
  grColumnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  grColumnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  grColumnHelper.accessor((row) => row.purchaseOrder.documentNo, {
    id: "poDocumentNo",
    header: "No. Pesanan",
    cell: (info) => (
      <Link href={entityHref("/pembelian/pesanan", info.row.original.purchaseOrder)} className="font-mono hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  grColumnHelper.accessor("warehouseName", {
    header: "Gudang",
    cell: (info) => info.getValue() || "-",
  }),
  grColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function VendorGoodsReceiptsTable({ data }: { data: VendorGoodsReceiptRow[] }) {
  return (
    <DataTable
      data={data}
      columns={grColumns}
      ariaLabel="Penerimaan barang pemasok"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface VendorPurchaseReturnRow {
  id: number
  documentNo: string
  date: string
  purchaseOrder: {
    id: number
    slug: string | null
    documentNo: string
  }
  status: string
}

const prColumnHelper = createColumnHelper<VendorPurchaseReturnRow>()

const prColumns = [
  prColumnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  prColumnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  prColumnHelper.accessor((row) => row.purchaseOrder.documentNo, {
    id: "poDocumentNo",
    header: "No. Pesanan",
    cell: (info) => (
      <Link href={entityHref("/pembelian/pesanan", info.row.original.purchaseOrder)} className="font-mono hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  prColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function VendorPurchaseReturnsTable({ data }: { data: VendorPurchaseReturnRow[] }) {
  return (
    <DataTable
      data={data}
      columns={prColumns}
      ariaLabel="Retur pembelian pemasok"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface VendorBillRow {
  id: number
  slug: string | null
  documentNo: string
  date: string
  grandTotal: number
  paidAmount: number
  status: string
}

const billColumnHelper = createColumnHelper<VendorBillRow>()

const billColumns = [
  billColumnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link href={entityHref("/pembelian/tagihan", info.row.original)} className="font-mono hover:underline">
        {info.getValue()}
      </Link>
    ),
  }),
  billColumnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  billColumnHelper.accessor("grandTotal", {
    header: "Total",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </div>
    ),
  }),
  billColumnHelper.accessor("paidAmount", {
    header: "Terbayar",
    meta: { align: "right" },
    cell: (info) => (
      <div className="text-right font-mono tabular-nums">
        {formatCurrencyExact(info.getValue())}
      </div>
    ),
  }),
  billColumnHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function VendorBillsTable({ data }: { data: VendorBillRow[] }) {
  return (
    <DataTable
      data={data}
      columns={billColumns}
      ariaLabel="Tagihan pemasok"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface VendorItemRow {
  id: number
  slug: string | null
  sku: string
  name: string
  cost: number
  qtyOnHand: number
}

const itemColumnHelper = createColumnHelper<VendorItemRow>()

export function VendorItemsTable({
  data,
  canViewCosts,
}: {
  data: VendorItemRow[]
  canViewCosts: boolean
}) {
  const columns = useMemo(() => {
    const cols: ErpColumnDef<VendorItemRow, any>[] = [
      itemColumnHelper.accessor("sku", {
        header: "SKU",
        cell: (info) => (
          <Link href={entityHref("/master/barang", info.row.original)} className="font-mono hover:underline">
            {info.getValue()}
          </Link>
        ),
      }),
      itemColumnHelper.accessor("name", {
        header: "Nama",
        meta: { mobilePrimary: true },
      }),
    ]
    if (canViewCosts) {
      cols.push(
        itemColumnHelper.accessor("cost", {
          header: "Harga Beli",
          meta: { align: "right" },
          cell: (info) => (
            <div className="text-right font-mono tabular-nums">
              {formatCurrencyExact(info.getValue())}
            </div>
          ),
        }),
      )
    }
    cols.push(
      itemColumnHelper.accessor("qtyOnHand", {
        header: "Stok",
        meta: { align: "right" },
        cell: (info) => (
          <div className="text-right font-mono tabular-nums">{info.getValue()}</div>
        ),
      }),
    )
    return cols
  }, [canViewCosts])

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Barang yang dipasok"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

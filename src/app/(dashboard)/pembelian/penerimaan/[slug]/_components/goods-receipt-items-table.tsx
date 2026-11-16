"use client"

import Link from "next/link"
import { useMemo } from "react"
import { createColumnHelper } from "@/lib/table"
import { DataTable } from "@/components/ui/data-table"
import { StatusChip } from "@/components/ui/status-chip"
import { entityHref } from "@/lib/utils/entity-url"
import { formatCurrencyExact } from "@/lib/utils/format"

export interface GoodsReceiptItemRow {
  id: number
  itemId: number
  itemName: string
  itemSku: string | null
  qtyOrdered: number | null
  qtyReceived: number
  uom: string | null
  unitCost: number
  warehouseName: string
  rackRowLabel: string
  stockMoveId: number | null
  stockMoveSlug: string | null
  receiptStatus: string
}

const columnHelper = createColumnHelper<GoodsReceiptItemRow>()

export function GoodsReceiptItemsTable({
  data,
  canViewCosts,
}: Readonly<{ data: GoodsReceiptItemRow[]; canViewCosts: boolean }>) {
  const columns = useMemo(
    () => [
      columnHelper.accessor("itemName", {
        header: "Barang",
        meta: { mobilePrimary: true },
        cell: (info) => {
          const row = info.row.original
          return (
            <div className="flex flex-col gap-0.5">
              <span className="font-medium text-foreground">{row.itemName}</span>
              {row.itemSku && (
                <span className="font-mono text-xs text-muted-foreground">
                  {row.itemSku}
                </span>
              )}
            </div>
          )
        },
      }),
      columnHelper.accessor("qtyOrdered", {
        header: "Kuantitas Dipesan",
        meta: { align: "right" },
        cell: (info) => {
          const val = info.getValue()
          return (
            <span className="font-mono tabular-nums">
              {val !== null ? val : "-"}
            </span>
          )
        },
      }),
      columnHelper.accessor("qtyReceived", {
        header: "Kuantitas Diterima",
        meta: { align: "right" },
        cell: (info) => {
          const row = info.row.original
          return (
            <span className="font-mono tabular-nums">
              {row.qtyReceived}
              {row.uom ? (
                <span className="ml-1 font-sans text-xs text-muted-foreground">
                  {row.uom}
                </span>
              ) : null}
            </span>
          )
        },
      }),
      ...(canViewCosts
        ? [
            columnHelper.accessor("unitCost", {
              header: "Biaya Satuan",
              meta: { align: "right" },
              cell: (info) => (
                <span className="font-mono tabular-nums">
                  {formatCurrencyExact(info.getValue())}
                </span>
              ),
            }),
          ]
        : []),
      columnHelper.accessor("warehouseName", {
        header: "Gudang",
      }),
      columnHelper.accessor("rackRowLabel", {
        header: "Rak / Baris",
      }),
      columnHelper.display({
        id: "stockMove",
        header: "Mutasi Stok",
        cell: (info) => {
          const row = info.row.original
          if (row.stockMoveId) {
            return (
              <Link
                href={entityHref("/inventaris/mutasi-stok", {
                  id: row.stockMoveId,
                  slug: row.stockMoveSlug,
                })}
                className="text-primary hover:underline font-mono"
              >
                SM-{row.stockMoveId}
              </Link>
            )
          }
          if (row.receiptStatus === "draft") {
            return (
              <span className="text-xs text-muted-foreground">
                Menunggu verifikasi
              </span>
            )
          }
          return "-"
        },
      }),
    ],
    [canViewCosts],
  )

  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Item Penerimaan Barang"
      selectable={false}
      enableColumnToggle={false}
      enableExport={false}
      pageSize={50}
    />
  )
}

export interface GoodsReceiptVendorBillRow {
  id: number
  slug: string | null
  documentNo: string
  grandTotal: number
  status: string
}

const billHelper = createColumnHelper<GoodsReceiptVendorBillRow>()
const billColumns = [
  billHelper.accessor("documentNo", {
    header: "No. Dokumen",
    meta: { mobilePrimary: true },
    cell: (info) => (
      <Link
        href={entityHref("/pembelian/tagihan", info.row.original)}
        className="font-mono text-primary hover:underline"
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
  billHelper.accessor("status", {
    header: "Status",
    cell: (info) => <StatusChip status={info.getValue()} />,
  }),
]

export function GoodsReceiptVendorBillsTable({
  data,
}: Readonly<{ data: GoodsReceiptVendorBillRow[] }>) {
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

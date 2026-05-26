"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteGoodsReceipt } from "@/actions/purchase.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface GoodsReceiptItem {
  id: number
}

interface GoodsReceipt {
  id: number
  documentNo: string
  date: Date | string
  status: string
  purchaseOrder: {
    documentNo: string
    vendor: { name: string }
  }
  warehouse: { name: string }
  items: GoodsReceiptItem[]
}

const columnHelper = createColumnHelper<GoodsReceipt>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/purchase/goods-receipts/${info.row.original.id}`} className="text-primary hover:underline font-medium font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.display({
    id: "poDocumentNo",
    header: "PO",
    cell: (info) => <span className="font-mono">{info.row.original.purchaseOrder.documentNo}</span>,
  }),
  columnHelper.display({
    id: "vendorName",
    header: "Vendor",
    cell: (info) => info.row.original.purchaseOrder.vendor.name,
  }),
  columnHelper.display({
    id: "warehouseName",
    header: "Gudang",
    cell: (info) => info.row.original.warehouse.name,
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "itemCount",
    header: "Items",
    cell: (info) => `${info.row.original.items.length} item`,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      return <StatusChip status={val} />
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={`/purchase/goods-receipts/${info.row.original.id}`}
        deleteAction={deleteGoodsReceipt}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface GoodsReceiptTableProps {
  data: GoodsReceipt[]
}

export function GoodsReceiptTable({ data }: GoodsReceiptTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar goods receipt"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("goodsReceipt", ids)}
    />
  )
}

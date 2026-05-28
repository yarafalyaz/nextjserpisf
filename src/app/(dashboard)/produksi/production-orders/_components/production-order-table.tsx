"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { StatusChip } from "@/components/ui/status-chip"
import { deleteProductionOrder } from "@/actions/manufacturing.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface ProductionOrder {
  id: number
  documentNo: string
  product: { name: string }
  quantity: number | string
  createdAt: Date | string
  status: string
}

const columnHelper = createColumnHelper<ProductionOrder>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/produksi/production-orders/${info.row.original.id}`} className="text-primary hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor((row) => row.product.name, {
    id: "productName",
    header: "Produk",
  }),
  columnHelper.accessor("quantity", {
    header: "Qty",
    cell: (info) => Number(info.getValue()),
  }),
  columnHelper.accessor("createdAt", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
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
        viewHref={`/produksi/production-orders/${info.row.original.id}`}
        deleteAction={deleteProductionOrder}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface ProductionOrderTableProps {
  data: ProductionOrder[]
}

export function ProductionOrderTable({ data }: ProductionOrderTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar production order"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("productionOrder", ids)}
    />
  )
}

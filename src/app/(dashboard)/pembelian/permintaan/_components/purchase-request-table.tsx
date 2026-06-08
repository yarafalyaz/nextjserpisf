"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deletePurchaseRequest } from "@/actions/purchase.actions"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface PurchaseRequestItem {
  id: number
}

interface PurchaseRequest {
  id: number
  documentNo: string
  date: Date | string
  requestDate?: Date | string | null
  status: string
  items: PurchaseRequestItem[]
}

const columnHelper = createColumnHelper<PurchaseRequest>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/pembelian/permintaan/${info.row.original.id}`} className="text-foreground hover:underline font-medium font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("requestDate", {
    header: "Tgl Permintaan",
    cell: (info) => {
      const val = info.getValue()
      return val ? formatDate(val) : "-"
    },
  }),
  columnHelper.display({
    id: "itemCount",
    header: "Item",
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
        viewHref={`/pembelian/permintaan/${info.row.original.id}`}
        deleteAction={deletePurchaseRequest}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface PurchaseRequestTableProps {
  data: PurchaseRequest[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function PurchaseRequestTable({ data, toolbar, filters }: PurchaseRequestTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar purchase request"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("purchaseRequest", ids)}
    />
  )
}

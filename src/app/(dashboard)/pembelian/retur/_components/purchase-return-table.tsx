"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface PurchaseReturnItem {
  id: number
}

interface PurchaseReturn {
  id: number
  documentNo: string
  date: Date | string
  status: string
  purchaseOrder: {
    documentNo: string
    vendor: { name: string }
  }
  items: PurchaseReturnItem[]
}

const columnHelper = createColumnHelper<PurchaseReturn>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/pembelian/retur/${info.row.original.id}`} className="text-primary hover:underline font-medium font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.display({
    id: "poDocumentNo",
    header: "PO",
    cell: (info) => <span className="font-mono">{info.row.original.purchaseOrder.documentNo}</span>,
  }),
  columnHelper.accessor("date", {
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
        viewHref={`/pembelian/retur/${info.row.original.id}`}
      />
    ),
  }),
]

interface PurchaseReturnTableProps {
  data: PurchaseReturn[]
}

export function PurchaseReturnTable({ data }: PurchaseReturnTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar retur pembelian"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("purchaseReturn", ids)}
    />
  )
}

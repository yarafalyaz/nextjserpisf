"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteDownPayment } from "@/actions/sales.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface DownPayment {
  id: number
  quotation: { documentNo: string; customer: { name: string } }
  amount: number | string
  status: string
  createdAt: Date | string
}

const columnHelper = createColumnHelper<DownPayment>()

const columns = [
  columnHelper.accessor((row) => row.quotation.documentNo, {
    id: "quotationDocumentNo",
    header: "Penawaran",
    cell: (info) => (
      <Link href={`/penjualan/uang-muka/${info.row.original.id}`} className="text-foreground hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor((row) => row.quotation.customer.name, {
    id: "customerName",
    header: "Pelanggan",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah DP",
    cell: (info) => <span className="text-right">{formatCurrency(Number(info.getValue()))}</span>,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    cell: (info) => {
      const val = info.getValue()
      return <span className={`status-badge status-${val}`}>{val}</span>
    },
  }),
  columnHelper.accessor("createdAt", {
    header: "Dibuat",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        deleteAction={deleteDownPayment}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface DownPaymentTableProps {
  data: DownPayment[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function DownPaymentTable({ data, toolbar, filters }: DownPaymentTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar down payment"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("downPayment", ids)}
    />
  )
}

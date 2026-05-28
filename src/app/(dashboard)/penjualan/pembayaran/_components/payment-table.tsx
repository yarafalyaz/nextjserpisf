"use client"

import { createColumnHelper } from "@tanstack/react-table"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteSalesPayment } from "@/actions/sales.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface SalesPayment {
  id: number
  documentNo: string
  salesInvoice: { documentNo: string; customer: { name: string } }
  paymentDate: Date | string
  paymentMethod: string
  amount: number | string
}

const columnHelper = createColumnHelper<SalesPayment>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/penjualan/pembayaran/${info.row.original.id}`} className="text-primary hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor((row) => row.salesInvoice.documentNo, {
    id: "invoiceNo",
    header: "Invoice",
    cell: (info) => <span className="font-mono">{info.getValue()}</span>,
  }),
  columnHelper.accessor((row) => row.salesInvoice.customer.name, {
    id: "customerName",
    header: "Customer",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("paymentDate", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("paymentMethod", {
    header: "Metode",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("amount", {
    header: "Jumlah",
    cell: (info) => <span className="text-right">{formatCurrency(Number(info.getValue()))}</span>,
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        deleteAction={deleteSalesPayment}
        deleteId={info.row.original.id}
      />
    ),
  }),
]

interface PaymentTableProps {
  data: SalesPayment[]
}

export function PaymentTable({ data }: PaymentTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar pembayaran sales"
      pageSize={20}
      selectable={true}
      onBulkDelete={(ids) => bulkDelete("salesPayment", ids)}
    />
  )
}

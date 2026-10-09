"use client"

import { createColumnHelper } from "@/lib/table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref } from "@/lib/utils/entity-url"

interface Invoice {
  id: number
  slug: string | null
  documentNo: string
  date: string
  dueDate: string | null
  totalAmount: string | number
  paidAmount: string | number
  status: string
  customer: { id: number; name: string }
}

interface InvoiceTableProps {
  data: Invoice[]
  total: number
  page: number
  pageSize: number
}

const columnHelper = createColumnHelper<Invoice>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={entityHref("/penjualan/faktur", info.row.original)} className="text-foreground hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("dueDate", {
    header: "Jatuh Tempo",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor((row) => row.customer.name, {
    id: "customerName",
    header: "Pelanggan",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("totalAmount", {
    header: "Total",
    cell: (info) => <span className="text-right">{formatCurrency(Number(info.getValue()))}</span>,
  }),
  columnHelper.accessor("paidAmount", {
    header: "Terbayar",
    cell: (info) => <span className="text-right">{formatCurrency(Number(info.getValue()))}</span>,
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
        viewHref={entityHref("/penjualan/faktur", info.row.original)}
        deletePermission="delete_sales_invoices"
      />
    ),
  }),
]

export function InvoiceTable({ data, total, page, pageSize }: InvoiceTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar invoice"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      searchColumn="documentNo"
      searchPlaceholder="Cari no. dokumen atau pelanggan..."
      onBulkDelete={(ids) => bulkDelete("salesInvoice", ids)}
    />
  )
}

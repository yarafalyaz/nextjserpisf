"use client"

import { createColumnHelper } from "@tanstack/react-table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteQuotation } from "@/actions/sales.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"

interface Quotation {
  id: number
  documentNo: string
  customer: { name: string }
  customerVehicle: { licensePlate: string } | null
  date: Date | string
  grandTotal: number | string
  status: string
}

const columnHelper = createColumnHelper<Quotation>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={`/penjualan/penawaran/${info.row.original.id}`} className="text-foreground hover:underline font-mono">
        {info.getValue()}
      </Link>
    ),
  }),
  columnHelper.accessor("date", {
    header: "Tanggal",
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor((row) => row.customer.name, {
    id: "customerName",
    header: "Pelanggan",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor((row) => row.customerVehicle?.licensePlate ?? "-", {
    id: "licensePlate",
    header: "Plat",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("grandTotal", {
    header: "Total",
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
        viewHref={`/penjualan/penawaran/${info.row.original.id}`}
        deleteAction={deleteQuotation}
        deleteId={info.row.original.id}
        editPermission="edit_quotations"
        deletePermission="delete_quotations"
      />
    ),
  }),
]

interface QuotationTableProps {
  data: Quotation[]
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function QuotationTable({ data, toolbar, filters }: QuotationTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar quotation"
      pageSize={20}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("salesQuotation", ids)}
    />
  )
}

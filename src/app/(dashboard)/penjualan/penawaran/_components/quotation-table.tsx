"use client"

import { createColumnHelper } from "@/lib/table"
import { StatusChip } from "@/components/ui/status-chip"
import Link from "next/link"
import { DataTable } from "@/components/ui/data-table"
import { ActionDropdown } from "@/components/ui/action-dropdown"
import { deleteQuotation } from "@/actions/sales.actions"
import { formatCurrency, formatDate } from "@/lib/utils/format"
import { bulkDelete } from "@/actions/bulk.actions"
import { entityHref } from "@/lib/utils/entity-url"
import { isQuotationExpired } from "@/lib/utils/quotation-expiry"

interface Quotation {
  id: number
  slug: string | null
  documentNo: string
  customer: { name: string }
  customerVehicle: { licensePlate: string } | null
  date: Date | string
  validUntil?: Date | string | null
  grandTotal: number | string
  status: string
}

const columnHelper = createColumnHelper<Quotation>()

const columns = [
  columnHelper.accessor("documentNo", {
    header: "No. Dokumen",
    cell: (info) => (
      <Link href={entityHref("/penjualan/penawaran", info.row.original)} className="text-foreground hover:underline font-mono">
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
      return (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <StatusChip status={val} />
          {isQuotationExpired(info.row.original.validUntil) ? (
            <span className="inline-flex items-center rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger">
              Lewat masa berlaku
            </span>
          ) : null}
        </span>
      )
    },
  }),
  columnHelper.display({
    id: "actions",
    header: "Aksi",
    enableSorting: false,
    cell: (info) => (
      <ActionDropdown
        viewHref={entityHref("/penjualan/penawaran", info.row.original)}
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
  total: number
  page: number
  pageSize: number
  toolbar?: React.ReactNode
  filters?: React.ReactNode
}

export function QuotationTable({ data, total, page, pageSize, toolbar, filters }: QuotationTableProps) {
  return (
    <DataTable
      data={data}
      columns={columns}
      ariaLabel="Daftar penawaran"
      serverPagination={{ total, page, pageSize }}
      selectable={true}
      toolbar={toolbar}
      filters={filters}
      onBulkDelete={(ids) => bulkDelete("salesQuotation", ids)}
    />
  )
}
